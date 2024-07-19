const {
    THREADS
} = require('@helpers/constants')
const {
    runWorker
} = require("@child_threads");

async function compresssReport(payload) {
    try {
      const upload_resp = await runWorker(THREADS.COMPRESS_REPORT_FILE, {
         payload
      });
      return upload_resp
  
    } catch (error) {
      console.error("Error on report Compression :", error);
      throw error;
    }
  
};

module.exports= {
    compresssReport
}