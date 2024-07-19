const clearObject = (obj) => {
  const newObj = {};
  for (const key in obj) {
    if (typeof obj[key] === "string") {
      newObj[key] = "";
    } else if (Array.isArray(obj[key])) {
      newObj[key] = [];
    } else if (typeof obj[key] === "object") {
      newObj[key] = {};
    } else if (typeof obj[key] === "number") {
      newObj[key] = 0;
    } else if (typeof obj[key] === "boolean") {
      newObj[key] = false;
    } else {
      newObj[key] = null; // fallback for other types
    }
  }
  return newObj;
};

module.exports = { clearObject };
