/**
 * graphEngine.ts
 * Generic engine for calculating financial reports based on Row and Column dependency graphs.
 */

export interface GraphNode {
  id: string;
  type: 'data' | 'aggregate' | 'calc';
  label?: string;
  account?: string;
  vertical?: string;
  scenario?: string;
  operation?: 'sum' | 'subtract' | 'divide';
  inputs?: string[];
  children?: string[];
  format?: 'number' | 'percentage';
  level?: number;
}

export interface GraphModel {
  nodes: Record<string, GraphNode>;
}

export class GraphEngine {
  /**
   * Evaluates a node in the graph for a specific context.
   * @param nodeId ID of the node to evaluate
   * @param model The graph model (Row or Column)
   * @param getValue Function to fetch base data values
   * @param cache Cache for memoizing results
   */
  evaluateNode(
    nodeId: string,
    model: GraphModel,
    getValue: (node: GraphNode) => number,
    cache: Map<string, number> = new Map()
  ): number {
    if (cache.has(nodeId)) return cache.get(nodeId)!;

    const node = model.nodes[nodeId];
    if (!node) return 0;

    let result = 0;

    if (node.type === 'data') {
      result = getValue(node);
    } else if (node.type === 'aggregate') {
      const children = node.children || [];
      result = children.reduce((acc, childId) => acc + this.evaluateNode(childId, model, getValue, cache), 0);
    } else if (node.type === 'calc') {
      const inputs = node.inputs || [];
      const inputValues = inputs.map(id => this.evaluateNode(id, model, getValue, cache));

      switch (node.operation) {
        case 'sum':
          result = inputValues.reduce((a, b) => a + b, 0);
          break;
        case 'subtract':
          result = inputValues[0] - (inputValues[1] || 0);
          break;
        case 'divide':
          const denominator = inputValues[1];
          result = (denominator !== 0 && denominator !== null) ? (inputValues[0] / denominator) : 0;
          break;
        default:
          result = 0;
      }
    }

    cache.set(nodeId, result);
    return result;
  }

  /**
   * Returns all leaf nodes of type 'data' required by the graph.
   */
  getDataNodes(model: GraphModel): GraphNode[] {
    const dataNodes: GraphNode[] = [];
    const seen = new Set<string>();

    const traverse = (nodeId: string) => {
      if (seen.has(nodeId)) return;
      seen.add(nodeId);

      const node = model.nodes[nodeId];
      if (!node) return;

      if (node.type === 'data') {
        dataNodes.push(node);
      } else {
        const refs = [...(node.children || []), ...(node.inputs || [])];
        refs.forEach(traverse);
      }
    };

    Object.keys(model.nodes).forEach(traverse);
    return dataNodes;
  }
}

export const graphEngine = new GraphEngine();
