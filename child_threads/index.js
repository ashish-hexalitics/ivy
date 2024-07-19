const {
    Worker
  } = require('worker_threads');
require("module-alias/register");
  
const runWorker = (type, input) => {
return new Promise((resolve, reject) => {
   

    const worker = new Worker(`./child_threads/${type}/index.js`, {
    workerData: input,
    });
    const shutdownGracefully = async () => {
        worker.removeAllListeners();
        worker.terminate();
    }
    worker.on('message', async (message) => {
    await shutdownGracefully();
    resolve(message);
    });
    worker.on('error',async (error) => {
    await shutdownGracefully();
    reject(error);
    });
    worker.on('messageerror', async (error) => {
        await shutdownGracefully();
    reject(error);
    });
});
};

module.exports = {
    runWorker
}