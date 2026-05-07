import { rawClient } from './src/services/oracleClient.js';

async function test() {
    const path = '/HyperionPlanning/rest/v1/applications/NetSuite/jobDefinitions';
    try {
        console.log(`Fetching v1 job definitions...`);
        const response = await rawClient.get(path);
        console.log('SUCCESS! DATA:', JSON.stringify(response.data, null, 2));
    } catch (err: any) {
        console.log('ERROR:', err.message);
    }
}

test();
