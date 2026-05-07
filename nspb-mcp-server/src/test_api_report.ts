import fetch from 'node-fetch';

async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/segment-overview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ periodLabel: 'Nov-25', filterDimensions: ['Subsidiary'], pov: {} })
    });
    
    console.log("Status:", res.status);
    const data = await res.json();
    console.log("Response Keys:", Object.keys(data));
    if (data.success) {
      console.log("Rows count:", data.rows.length);
      console.log("First row ID:", data.rows[0].id);
      console.log("First row columns:", Object.keys(data.rows[0]));
    } else {
      console.log("Error:", data.error);
    }
  } catch (err: any) {
    console.error("Fetch failed:", err.message);
  }
}

test();
