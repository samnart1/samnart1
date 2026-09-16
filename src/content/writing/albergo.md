---
title: "Albergo"
description: ""
pubDate: 2026-09-16
tags: ["go", "postgresql", "concurrency", "backend-api"]
repo: "https://github.com/samnart1/albergo"
draft: false
---

<!-- # Building Albergo: booking the last room -->

I built Albergo, a project in Go and PostgreSQL. It's a small hotel booking API where guests can search for availability, book a room and cancel a reservation and also allow staff can publish inventory and rates.

The part I want to explain here is what happens when two people try to book the last available slot for a room. That question kind of shaped the project. It also led to another question: what happens when a booking succeeds, but the guest never receives the response?

First, a room in Albergo means a room type. A guest books a double room or a suite. The application doesn't assign them room 204. That keeps physical room allocation outside the scope of this project.

Inventory is stored per room type, per date. Each row records how many rooms are offered for that night and how many have been booked. For a three-night stay, all three nights must have space. If there are four doubles available on Friday, one on Saturday and three on Sunday, I can sell one more stay covering all three nights.

The checkout date is excluded. Arriving on 14 March and leaving on 17 March uses the nights of the 14th, 15th and 16th. This lets one guest leave on the day another arrives without their bookings overlapping.

Pricing follows the same daily structure. A rate plan has a price calendar, along with restrictions such as minimum stays and dates closed to arrivals or departures. When a reservation is created, its nightly prices are copied into the booking. Changing tomorrow's published rate shouldn't change the price of an existing reservation.

With that model in place, the booking operation has to update several things together: inventory, the reservation, its nightly prices, the idempotency record and an event for the notification worker. They all belong to the same database transaction. If one part fails, the rest must roll back.

The inventory table contains this constraint:

```sql
CONSTRAINT inventory_not_oversold
    CHECK (booked >= 0 AND booked <= allotment)
```

That gives the database a rule it can enforce regardless of which application path updates the counters. The booking code still needs to update the right rows and handle failures, but an inventory row can't commit with more rooms booked than offered.

To reserve a stay, I lock its inventory rows in date order and increment their counters:

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
WHERE i.room_type_id = $1
  AND i.stay_date = l.stay_date;
```

For a booking, the delta is one. A cancellation uses the same inventory operation with a delta of minus one. The cancellation also checks and updates the reservation's status, so repeating it doesn't release another room.

When two booking transactions need the same inventory rows, one waits for the other. If the first takes the last room, the second can't commit an increment beyond the allotment. The application maps that constraint violation to a `409` response with the code `sold_out`.

There is another check after the update: the number of affected rows must equal the number of nights. A missing inventory row means availability hasn't been published for that date. If this happens halfway through a stay, the transaction rolls back the changes to the other nights too.

Taking the locks in date order gives overlapping stays a consistent order for acquiring inventory locks. This reduces a source of deadlocks. It doesn't mean every possible transaction in the application is now deadlock-free.

I kept the default PostgreSQL isolation level, Read Committed. For this operation, the row locks and constraint enforce the inventory limit, while the transaction makes the changes across the stay atomic. I didn't need another service to coordinate those writes. An application mutex would only cover one running process, and adding Redis would introduce another dependency around data PostgreSQL already owns.

Other approaches can work. A version column with conditional updates is one option. An exclusion constraint makes sense when each booking claims a specific room or another individual resource. The counters fit the room-type model I chose for Albergo.

This also means an availability search isn't a reservation. A guest might see one room available, spend a minute entering their details and find that someone else booked it. The booking request has to handle that outcome even when the search was correct when it ran.

Retries are a separate problem. Suppose PostgreSQL commits a reservation, but the connection drops before the response reaches the guest. Retrying the request with a new identity could create a second valid booking. There may be enough inventory for both, so the inventory constraint won't help.

Albergo requires an `Idempotency-Key` on booking requests. The client reuses that key when retrying the same request. The application claims the key inside the booking transaction and associates it with the resulting reservation.

If another request arrives with the same key, the database coordinates access to that key. Once the first transaction commits, the retry can load the existing reservation instead of creating another one. If the first transaction rolls back, its key claim rolls back too.

The key is also stored with a hash of the request body. Reusing it with different content returns a conflict. There are two details worth being clear about: the hash currently uses the raw JSON bytes, so even a formatting change matters, and a retry returns the existing reservation's current state. Albergo doesn't store an exact copy of the original HTTP response.

Notifications use an outbox. The booking transaction writes an event into a table, and a separate worker reads pending events using `FOR UPDATE SKIP LOCKED`. That lets workers claim different batches without processing the same locked rows at the same time.

The guarantee here is that the booking and its notification event commit together. Delivery happens afterwards. A worker could send a message and crash before recording success, causing it to send the message again on a later attempt. A real sender would need to account for duplicates.

For this project, the sender writes to the log. Failed sends are retried, and events stop being selected after five failures. Connecting an email provider would therefore also require a way to inspect and recover those failed events. The outbox gives me a durable handoff; it doesn't guarantee that an email reaches someone's inbox.

I tested the domain rules separately from the database behaviour. Unit tests cover dates, stay lengths, money, pricing restrictions and cancellations. Integration tests use an actual PostgreSQL container to exercise the repositories and HTTP API, including rollback, authentication, idempotency and the outbox.

One test publishes a single available room, then releases fifty booking requests from a shared start barrier. It expects one successful reservation, forty-nine `sold_out` responses and a booked counter of one. Another sends twenty requests with the same idempotency key and checks that they all resolve to one reservation.

Those tests are useful but there is room to improve them. The overselling test currently uses the same guest email for every request. Since booking also upserts that guest record, the requests can queue on the guest row before reaching inventory. Using different guests would test inventory contention more directly. I'd also add concurrent cancellations and partially overlapping stays.

CI runs formatting checks, vet, the build, unit tests, integration tests and linting. The Go tests run with the race detector, although the database assertions are what check the booking behaviour. The race detector alone can't tell me whether I've sold too many rooms.

The project is deliberately small. It doesn't handle payments, bookings for several rooms, channel-manager synchronisation or physical room allocation. Staff authentication uses a shared API key, and cancellation deadlines currently use UTC midnight rather than a property's local check-in time. Those are limits of the current implementation that would need attention before using it for a real hotel.

Albergo gives me a concrete booking flow to work through: search, reserve, retry, cancel and process the resulting events. Most of the interesting decisions are inbetween those steps. A successful reservation has to agree with the inventory counters, survive a lost response and leave a notification event behind. That's the part of the project I wanted to understand and make testable.
<!-- The code is on [GitHub](https://github.com/samnart1/albergo). -->
