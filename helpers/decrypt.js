const crypto = require("crypto");
const decrypt= function(enc,base64data,key=process.env.ENCRYPTION_KEY,algorithm =process.env.ENCRYPTION_ALGORITHM){
    const originalData= Buffer.from (base64data, 'base64') 

    const decipher = crypto.createDecipheriv(algorithm, key, originalData);
    let decryptedData = decipher.update(enc,"hex", "utf-8");
    
    decryptedData += decipher.final("utf8");
    return decryptedData;   
}
module.exports = {
    decrypt
}