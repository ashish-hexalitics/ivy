const mongoose = require('mongoose');

const url = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ivy-backend';

  mongoose.connect(url, {
    useNewUrlParser: true,
    autoIndex: true,

  }).then(() => {
    console.log('Connected to the database!');
  }).catch((err) => {
    console.log('Cannot connect to the database!', err);
  });