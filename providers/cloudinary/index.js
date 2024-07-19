const fs = require("fs");
class CloudinaryProvider {
  constructor() {
    this.cd = require("cloudinary").v2;
    this.cd.config({
      cloud_name: process.env.CLOUDINARY_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  async streamUpload(input, options = {}) {
    console.log("inside stream upload clodinary");
    try {
      return new Promise((resolve, reject) => {
        let stream = this.cd.uploader.upload_stream(
          options,
          (error, result) => {
            if (result) {
              console.log("result", result);
              resolve(result);
            } else {
              console.error(error);
              reject(error);
            }
          }
        );
        input.pipe(stream);
      });
    } catch (error) {
      console.log("error", error);
    }
  }
}

module.exports = CloudinaryProvider;
