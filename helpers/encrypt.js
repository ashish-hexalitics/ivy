

var crypto=require('crypto'); 
const encrypt= function (text,iv,key=process.env.ENCRYPTION_KEY,algorithm =process.env.ENCRYPTION_ALGORITHM){
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    
    let encryptedData = cipher.update(text, "utf-8", "hex");
    
    encryptedData += cipher.final("hex");
    base64data = Buffer.from(iv, 'binary').toString('base64');
    return encryptedData;
}
module.exports = {
    encrypt
}