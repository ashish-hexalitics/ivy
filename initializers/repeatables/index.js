const cron = require('node-cron');
const Tenancy = require('@model/tenancySchema.js');
const Report = require('@model/reportSchema.js');

cron.schedule('0 0 * * *', async () => {
    console.log('Running cron job for Tenants every midnight...');
    const cursor = await Tenancy.find({
    })
    .select("tenants report_id")
    .cursor();
    const reportids_to_updated = []
    const requester=[]
    for await (const tenancy of cursor) {
        const tenants = tenancy.tenants;
        let all_tenants_complete = true;
        for (const tenant of tenants) {
          const { status, signed_timestamp } = tenant;
          if (status === 'signed') {
            const signed_time = new Date(signed_timestamp);
            const current_time = new Date();
            const time_diff = (current_time - signed_time)/(1000 * 60 * 60 * 24);
            if(time_diff > 7)tenant.status = 'complete';
          }
          if (tenant.status !== 'complete') all_tenants_complete = false;
        }
        requester.push(tenancy.save());
        if(all_tenants_complete)reportids_to_updated.push(tenancy.report_id)
    }
    console.log("Report ids to be updated :", reportids_to_updated)
    const update_report_promises = reportids_to_updated.map(async (report_id) => {
      const report = await Report.findById(report_id)
      if (report.status != 'completed') {
        report.status = 'completed';
        return report.save();
      }
    });
    await Promise.all([requester, update_report_promises]);
});

