import { planningClient } from './src/services/oracleClient.js';

async function listAccounts() {
  const planType = 'NSP_NFS';
  try {
    const res = await planningClient.get(`/plantypes/${planType}/dimensions/Account`);
    
    function printNode(node: any, depth: number) {
      console.log(`${' '.repeat(depth * 2)}${node.name} (${node.alias || ''}) [Level: ${node.level}]`);
      if (node.children) {
        node.children.forEach((c: any) => printNode(c, depth + 1));
      }
    }
    
    printNode(res.data, 0);
  } catch (err: any) {
    console.error('Failed:', err.response?.data || err.message);
  }
}

listAccounts();
