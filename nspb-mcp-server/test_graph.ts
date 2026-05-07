import { graphEngine, GraphModel } from './src/services/graphEngine.js';

const ROW_GRAPH: GraphModel = {
  nodes: {
    "REV_TOTAL": { id: "REV_TOTAL", type: "aggregate", children: ["REV_CASINO", "REV_SPORT"] },
    "REV_CASINO": { id: "REV_CASINO", type: "aggregate", children: ["R1", "R2"] },
    "R1": { id: "R1", type: "data" },
    "R2": { id: "R2", type: "data" },
    "REV_SPORT": { id: "REV_SPORT", type: "data" },
    "COST": { id: "COST", type: "data" },
    "GM": { id: "GM", type: "calc", operation: "subtract", inputs: ["REV_TOTAL", "COST"] },
    "GM_PCT": { id: "GM_PCT", type: "calc", operation: "divide", inputs: ["GM", "REV_TOTAL"] }
  }
};

const dummyData = new Map<string, number>([
  ["R1", 100],
  ["R2", 50],
  ["REV_SPORT", 200],
  ["COST", 120]
]);

const getValue = (node: any) => dummyData.get(node.id) || 0;

console.log('--- GRAPH EVALUATION TEST ---');
console.log('R1:', graphEngine.evaluateNode('R1', ROW_GRAPH, getValue));
console.log('REV_CASINO (100+50):', graphEngine.evaluateNode('REV_CASINO', ROW_GRAPH, getValue));
console.log('REV_TOTAL (150+200):', graphEngine.evaluateNode('REV_TOTAL', ROW_GRAPH, getValue));
console.log('GM (350-120):', graphEngine.evaluateNode('GM', ROW_GRAPH, getValue));
console.log('GM_PCT (230/350):', graphEngine.evaluateNode('GM_PCT', ROW_GRAPH, getValue));
