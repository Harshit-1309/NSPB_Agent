import { segmentOverview } from './src/tools/segmentOverview.js';

async function testSegmentOverview() {
  try {
    const result = await segmentOverview({
      periodLabel: 'Mar-25',
      filterDimensions: [],
      pov: {
        "Subsidiary": "NSP_Total Subsidiary",
        "Region": "Total Region",
        "Location": "NSP_Total Location",
        "Relationship": "NSP_Total Relationship",
        "Tracker": "NSP_Amount",
        "Currency": "EUR_Reporting",
        "Department": "TD",
        "Class": "TC",
        "Vertical": "Vertical",
        "Version": "NSP_Base"
      }
    });

    if (result.success) {
      console.log('SUCCESS');
    } else {
      console.error('FAILED:', result.error);
    }
  } catch (e: any) {
    console.error('ERROR:', e.message);
  }
}

testSegmentOverview();
