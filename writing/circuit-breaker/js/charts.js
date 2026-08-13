/*
 * charts.js
 *
 * Four sparklines, last ninety sim seconds. Deliberately small and unlabelled
 * inside the plot: the number above each one is the current reading, the line
 * only shows whether it is moving.
 *
 * Each chart can carry a dashed reference line at the measured value for the
 * condition currently dialled in. That is the honesty mechanism on this page:
 * the solid line is a toy, the dashed line is what the machine actually did,
 * and you can see the gap.
 */

const SVG_NS = "http://www.w3.org/2000/svg";
const W = 260;
const H = 54;
const PAD = 3;

export class Spark {
  /**
   * @param {SVGElement} svg
   * @param {{min?:number, max?:number, pad?:number}} scale fixed axis, or auto
   */
  constructor(svg, scale = {}) {
    this.svg = svg;
    this.scale = scale;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.innerHTML = "";

    this.ref = document.createElementNS(SVG_NS, "line");
    this.ref.setAttribute("class", "spark-ref");
    this.ref.setAttribute("x1", 0);
    this.ref.setAttribute("x2", W);
    this.ref.style.display = "none";

    this.line = document.createElementNS(SVG_NS, "polyline");
    this.line.setAttribute("class", "spark-line");
    this.line.setAttribute("fill", "none");

    svg.append(this.ref, this.line);
  }

  /**
   * @param {number[]} values
   * @param {number|null} measured dashed reference, or null to hide it
   */
  draw(values, measured = null) {
    if (!values || values.length < 2) {
      this.line.setAttribute("points", "");
      this.ref.style.display = "none";
      return;
    }

    let lo = this.scale.min;
    let hi = this.scale.max;
    if (lo === undefined || hi === undefined) {
      lo = Math.min(...values, measured === null ? Infinity : measured);
      hi = Math.max(...values, measured === null ? -Infinity : measured);
      const pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.05 || 1;
      lo -= pad;
      hi += pad;
    }
    const span = hi - lo || 1;
    const y = (v) => PAD + (H - 2 * PAD) * (1 - (v - lo) / span);
    const x = (i) => (W * i) / (values.length - 1);

    this.line.setAttribute(
      "points",
      values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")
    );

    if (measured === null || measured < lo || measured > hi) {
      this.ref.style.display = "none";
    } else {
      this.ref.style.display = "";
      this.ref.setAttribute("y1", y(measured).toFixed(1));
      this.ref.setAttribute("y2", y(measured).toFixed(1));
    }
  }
}