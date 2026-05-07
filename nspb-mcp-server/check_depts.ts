import { planningClient } from './src/services/oracleClient.js';

async function checkDepartments() {
  const planType = 'NSP_NFS';
  try {
    const res = await planningClient.get(`/plantypes/${planType}/dimensions/Department`);
    console.log('--- DEPARTMENTS ---');
    function traverse(node: any) {
      console.log(`${node.name} (${node.alias || 'No Alias'})`);
      if (node.children) node.children.forEach(traverse);
    }
    traverse(res.data);
  } catch (err: any) {
    console.error('Failed:', err.message);
  }
}

checkDepartments();
