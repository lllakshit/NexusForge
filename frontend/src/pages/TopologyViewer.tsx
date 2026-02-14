import { useEffect, useRef } from "react";
import * as d3 from "d3";

type GraphNode = d3.SimulationNodeDatum & {
  id: string;
  group: "service" | "event";
};

type GraphLink = d3.SimulationLinkDatum<GraphNode>;

const nodes: GraphNode[] = [
  { id: "frontend", group: "service" },
  { id: "gateway", group: "service" },
  { id: "auth-service", group: "service" },
  { id: "project-service", group: "service" },
  { id: "job-service", group: "service" },
  { id: "file-service", group: "service" },
  { id: "mcp-server", group: "service" },
  { id: "incident-service", group: "service" },
  { id: "worker-python", group: "service" },
  { id: "nats.jetstream", group: "event" },
  { id: "temporal", group: "event" }
];

const links: GraphLink[] = [
  { source: "frontend", target: "gateway" },
  { source: "gateway", target: "auth-service" },
  { source: "gateway", target: "project-service" },
  { source: "gateway", target: "job-service" },
  { source: "gateway", target: "file-service" },
  { source: "gateway", target: "mcp-server" },
  { source: "job-service", target: "temporal" },
  { source: "temporal", target: "worker-python" },
  { source: "auth-service", target: "nats.jetstream" },
  { source: "project-service", target: "nats.jetstream" },
  { source: "job-service", target: "nats.jetstream" },
  { source: "file-service", target: "nats.jetstream" },
  { source: "incident-service", target: "nats.jetstream" }
];

export function TopologyViewer() {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;

    const width = 920;
    const height = 520;
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const simulation = d3
      .forceSimulation<GraphNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance(110)
      )
      .force("charge", d3.forceManyBody().strength(-340))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const link = svg
      .append("g")
      .attr("stroke", "#94a3b8")
      .attr("stroke-opacity", 0.8)
      .selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("stroke-width", 1.8);

    const node = svg
      .append("g")
      .selectAll("circle")
      .data(nodes)
      .enter()
      .append("circle")
      .attr("r", 16)
      .attr("fill", (d) => (d.group === "service" ? "#14b8a6" : "#f59e0b"))
      .call(
        d3
          .drag<SVGCircleElement, GraphNode>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    const label = svg
      .append("g")
      .selectAll("text")
      .data(nodes)
      .enter()
      .append("text")
      .text((d) => d.id)
      .attr("font-size", 11)
      .attr("fill", "#0f172a");

    simulation.on("tick", () => {
      const getNode = (value: string | GraphNode): GraphNode =>
        typeof value === "string" ? nodes.find((node) => node.id === value)! : value;

      link
        .attr("x1", (d) => getNode(d.source as string | GraphNode).x ?? 0)
        .attr("y1", (d) => getNode(d.source as string | GraphNode).y ?? 0)
        .attr("x2", (d) => getNode(d.target as string | GraphNode).x ?? 0)
        .attr("y2", (d) => getNode(d.target as string | GraphNode).y ?? 0);

      node.attr("cx", (d) => d.x ?? 0).attr("cy", (d) => d.y ?? 0);
      label.attr("x", (d) => (d.x ?? 0) + 20).attr("y", (d) => (d.y ?? 0) + 4);
    });

    return () => {
      simulation.stop();
    };
  }, []);

  return (
    <section className="space-y-3">
      <h2 className="text-2xl font-semibold">Topology Viewer</h2>
      <p className="text-sm text-slate-600">Replayable graph of service calls, workflow edges, and event channels.</p>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-2">
        <svg ref={ref} className="h-[520px] w-full" />
      </div>
    </section>
  );
}
