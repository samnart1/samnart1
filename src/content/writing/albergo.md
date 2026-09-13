---
title: "The Last Room"
description: "Six ways engineers stop two guests from booking the same hotel room, why five of them are wrong for hotels, and what I shipped instead."
pubDate: 2026-09-13
tags: ["go", "postgresql", "concurrency", "system-design"]
repo: "https://github.com/samnart1/albergo"
draft: false
---

Two guests click "book" on the last room at the same millisecond. One of them
has to get a room and the other has to get an honest refusal. Nothing else is
acceptable: an oversold room is a person standing in a lobby in Bolzano at 11pm
with a confirmation email and nowhere to sleep.

That is the whole problem. Everything else in a booking engine is CRUD with
good error messages.

I built one, `albergo`, in Go and PostgreSQL. This is what I learned about how
people normally solve this, why most of the usual answers are wrong for hotels
specifically, and what I did instead.

## What a hotel actually sells

Almost every double booking tutorial starts from the wrong model: a table of
rooms, and a booking that claims one of them for a date range. Prevent
overlapping claims on the same room and you are done.

Hotels do not work that way. A hotel sells a **room type**, not a room. You
book "a double room," and which numbered door you get is decided at check in,
often on the morning of arrival, by a receptionist who is juggling early
arrivals, late departures, and the guest who asked for a quiet floor.

So availability is not "is room 204 free." It is "how many doubles are still
unsold on each night of this stay." That is a counter, not an interval.

Two more things fall out of the domain and they matter more than they look:

**A stay is a half open interval.** Check in 14 March, check out 17 March is
three nights: the 14th, 15th and 16th. The departure date is not a night that
gets sold. Model it any other way and back to back bookings, one guest leaving
the morning another arrives, will collide with each other forever.

**Prices live on dates, not on bookings.** A rate plan publishes a price per
date plus restrictions: minimum length of stay, closed to arrival, closed to
departure. "Three night minimum if you arrive on a Friday in high season" is
not a business rule you invent, it is a row in the rate calendar. And the price
of a booking is frozen at the moment it is taken, because a rate change next
week must not silently rewrite what a guest already agreed to pay.

Get the model wrong and no amount of locking saves you.

## Seven ways people do it

### 1. Check, then write

```go
free, _ := repo.CountAvailable(ctx, roomTypeID, stay)
if free < 1 {
    return ErrSoldOut
}
return repo.CreateBooking(ctx, booking)
```

Both requests read "1 available." Both pass the check. Both write. This is a
read modify write race and it is the baseline bug that every other approach on
this list exists to fix. It survives in production for years because it only
fails under concurrency, and most test suites have none.

### 2. An application mutex

Wrap the critical section in a `sync.Mutex`. Correct on one process. Wrong the
instant you run two containers, which on Cloud Run or Kubernetes is the first
Tuesday you get traffic. It also encourages the belief that the problem is
solved, which makes it worse than the bug it replaces.

### 3. A distributed lock

Reach for Redis, `SET NX` a key named after the room type and the dates, do the
work, delete the key.

This is the most common answer in system design interviews and the one I would
push back on hardest. Martin Kleppmann's
[critique of Redlock](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html)
is the reference: an algorithm that assumes bounded network delay and
trustworthy clocks is not safe to hang correctness on, and without fencing
tokens a process that pauses for a GC cycle can wake up believing it still
holds a lock that expired and was handed to someone else. Container CPU
throttling and VM stalls produce the same pause, and they are not rare.

The deeper objection is architectural. You already have a system whose entire
job is serializing concurrent access to data with real transactional
guarantees. Adding a second, weaker one beside it, and then needing both to
agree, is more moving parts for less safety. Distributed locks earn their place
when the contended resource is not in your database. A row in your database is
not that.

### 4. Optimistic concurrency

Put a `version` column on the row, read it, and write with
`WHERE version = $old`. Zero rows affected means someone beat you, so retry.

This is genuinely good, and it is the right default for low contention updates
where a conflict is rare and a retry is cheap. It is a poor fit here for one
reason: the last room on a popular weekend is the definition of high
contention. Optimistic concurrency under contention degrades into a retry storm
where most of the work done is thrown away, and you have to write retry and
backoff logic that is itself a source of bugs.

### 5. Pessimistic row locks

`SELECT ... FOR UPDATE` the rows you are about to change, inside a transaction.
Everyone else queues at the database. This is the workhorse answer and it is
correct. It is also half of what I ended up doing.

The objection people raise is throughput: locks serialize. In practice the lock
is held for the few milliseconds of one transaction and the contention is
scoped to one room type on one set of dates, not the whole hotel. A hotel with
forty rooms is not the workload where this breaks.

### 6. An exclusion constraint

PostgreSQL can enforce non overlap declaratively:

```sql
CREATE EXTENSION btree_gist;

ALTER TABLE bookings ADD CONSTRAINT no_overlap
EXCLUDE USING gist (room_id WITH =, stay WITH &&);
```

Now two overlapping bookings on the same room are impossible, no matter what
code writes them: your API, an admin tool, a migration script, someone typing
into psql during an incident. It is the most elegant thing in this article.

It is also the wrong tool for a hotel, because it enforces "one booking per
room," and a hotel legitimately wants ten concurrent bookings on the same room
type when it has ten doubles. You would have to assign a numbered room at
booking time purely to have something to exclude on, which is a real product
decision, made backwards, to satisfy a constraint.

If you are building a meeting room scheduler, a tennis court, a barber's chair,
anything where the unit **is** the thing being sold, this is the right answer
and you should use it.

### 7. Serialize per resource with a queue

Partition a log by room type so all writes for one room type land on one
consumer, and the consumer processes them one at a time. This is roughly how
you would do it at Ticketmaster scale, where the contention is a hundred
thousand people on one event.

It buys you throughput and costs you synchronous responses. The guest now gets
"we are processing your request" instead of a confirmation, which means a
status endpoint, a polling client, and a whole category of stuck-in-pending
support tickets. Correct, and enormously more machinery than a single hotel's
booking volume justifies.

## What I built

Counters, with the invariant in the schema:

```sql
CREATE TABLE inventory (
    room_type_id uuid NOT NULL REFERENCES room_types(id),
    stay_date    date NOT NULL,
    allotment    smallint NOT NULL CHECK (allotment >= 0),
    booked       smallint NOT NULL DEFAULT 0,
    PRIMARY KEY (room_type_id, stay_date),
    CONSTRAINT inventory_not_oversold CHECK (booked >= 0 AND booked <= allotment)
);
```

One row per room type per date. Booking a three night stay touches three rows.

The write locks every night of the stay, in ascending date order, then
increments:

```sql
WITH locked AS (
    SELECT stay_date
    FROM inventory
    WHERE room_type_id = $1
      AND stay_date >= $2
      AND stay_date < $3
    ORDER BY stay_date
    FOR UPDATE
)
UPDATE inventory i
SET booked = i.booked + $4
FROM locked l
WHERE i.room_type_id = $1 AND i.stay_date = l.stay_date
```

That is the entire concurrency design. The loser of the race does not fail a
check in my Go code; it violates `inventory_not_oversold` and the transaction
aborts. The application's job is to translate that into a `409 sold_out` with a
useful message, not to be the thing standing between a guest and an oversold
room.

Three properties I care about:

**The invariant is in the schema, not the code.** Every future code path gets
it for free. The admin tool nobody has written yet, the bulk import, the
partner integration, the migration script run at 2am during an incident. Code
paths multiply; a constraint does not.

**Row count is the error signal.** If the update touches fewer rows than the
stay has nights, a night has no inventory published at all. That is a different
failure from being sold out and deserves a different response code, and the
`RowsAffected` count tells me for free.

**Deltas compose.** Cancellation is the same statement with a negative delta,
and `booked >= 0` catches a double release the same way the upper bound catches
an oversell.

## Four details that bite

### Lock ordering is not optional

`ORDER BY stay_date` in that CTE is load bearing. Without it, two overlapping
stays can acquire the same two rows in opposite orders and deadlock. Postgres
will detect it and kill one transaction, so you do not corrupt data, but you do
get random failures under exactly the load you built this for. Deterministic
lock ordering turns a deadlock into a queue.

### SERIALIZABLE is not the answer here

The reflex when someone says "race condition" is to raise the isolation level.
It is worth being able to say why not.

The invariant is local to each row and enforced by a constraint on the row being
updated. READ COMMITTED plus row locks already gives it to me. SERIALIZABLE
would add serialization failures under contention, which means a retry loop in
application code, which is the retry storm from approach 4 arriving through a
different door. Higher isolation is a real tool for invariants that span rows a
transaction never touched. This is not one of them.

### The availability check is a race and that is fine

The search endpoint checks availability and can be stale by the time the
booking arrives. This is time of check to time of use by construction and no
amount of care removes it, because the guest spends thirty seconds typing their
name.

The response is not to fix it but to be clear about what it is for. The search
path exists to give a fast, friendly answer in the common case. The database
constraint is the authority. Any design where the pre-check is load bearing is
one bug away from an oversell; any design where it is advisory is one that
degrades into a 409 instead.

### The retry that books twice

Solving the concurrent case and leaving the sequential one open is the most
common way this ships broken. A guest on hotel wifi taps "confirm," the
response is lost, the app retries, and they are now holding two rooms. No
amount of locking helps: those requests are seconds apart.

The fix is an idempotency key, and the detail that matters is where you claim
it. I insert the key row inside the same transaction as the booking:

```
BEGIN
  INSERT INTO idempotency_keys (key, request_hash) ON CONFLICT DO NOTHING
  ...book...
  UPDATE idempotency_keys SET reservation_id = ...
COMMIT
```

A duplicate request blocks on the uncommitted key row, and once the original
commits it reads the result and replays the original response. There is no
window where the key exists and the booking does not, which is exactly the
window a "claim the key, then book" implementation leaves open for a crash to
fall into. The key is also bound to a hash of the request body, so the same key
with different content is a conflict rather than a silent replay of someone
else's booking.

The same "one transaction" reasoning applies to the confirmation email. Writing
to the database and publishing to a broker are two systems and cannot be made
atomic, so the event goes into an `outbox` table in the booking transaction and
a worker drains it with `FOR UPDATE SKIP LOCKED`. A rolled back booking cannot
have sent mail. A committed one cannot be missing it.

## Proving it

A design like this is worth exactly as much as the test that demonstrates it.

```go
func TestNoOversellUnderConcurrency(t *testing.T) {
	srv, fx := newServer(t)
	publish(t, srv.URL, fx, 1) // one room, three nights

	const attempts = 50
	start := make(chan struct{})

	for range attempts {
		go func() {
			<-start
			status, body := post(srv.URL+"/v1/reservations", bookingBody(fx))
			record(status, body)
		}()
	}
	close(start)
	// ...

	// exactly one 201, forty nine 409 sold_out, and booked = 1
}
```

Fifty goroutines held at a barrier, released together, against a real
PostgreSQL in a container. Assert one `201`, forty nine `409 sold_out`, and
`booked = 1` in the database afterwards. Run it with `-race` and `-count=5`.

Anything less than a real database proves nothing. An in memory fake would have
to re-implement the constraint in Go with a mutex, and would then pass the test
while telling you nothing about the thing that actually enforces the invariant.
That is why there is no fake behind the repository contract suite in this
project: a test double that lies about the one property under test is worse
than no double at all.

## What I left out, on purpose

Payments, multi room bookings, channel manager sync, per unit room assignment,
occupancy based pricing, and a real identity provider for staff. Each is a
well understood adapter behind a port, and none of them changes the concurrency
model, which is the part worth getting right first.

One simplification I would call out rather than hide: check in is treated as UTC
midnight, so the refund deadline does not shift with the property's timezone.
A production system stores the timezone on the property and computes the
deadline against it. Knowing where your model is thin is more useful than
pretending it is not.

## The short version

Model what is actually sold, not what is convenient to lock. Put the invariant
in the schema so every code path inherits it. Lock in a deterministic order.
Treat the pre-check as a courtesy and the constraint as the truth. Make retries
idempotent inside the same transaction that does the work. Then write the test
that fires fifty requests at the last room, because a concurrency design you
have not run under concurrency is a hypothesis.

Source: [github.com/samnart1/albergo](https://github.com/samnart1/albergo)
