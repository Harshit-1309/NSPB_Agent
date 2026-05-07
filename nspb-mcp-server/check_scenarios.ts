import { planningClient } from './src/services/oracleClient.js';

async function checkScenarios() {
  const planType = 'NSP_NFS';
  try {
    const res = await planningClient.get(`/plantypes/${planType}/dimensions/Scenario`);
    console.log('--- SCENARIOS ---');
    function traverse(node: any) {
      console.log(`${node.name} (${node.alias || 'No Alias'})`);
      if (node.children) node.children.forEach(traverse);
    }
    traverse(res.data);
  } catch (err: any) {
    console.error('Failed:', err.message);
  }
}

checkScenarios();
