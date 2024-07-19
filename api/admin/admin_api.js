const express = require("express");

module.exports = function (router) {
    const admin_account_router = express.Router();
    router.use("/account", admin_account_router);
    require("./account")(admin_account_router);
    
    // const tag_router = express.Router();
    // router.use("/tag", tag_router);
    // require("./tag/tag.js")(tag_router);

    // const category_router = express.Router();
    // router.use("/category", category_router);
    // require("./category/category.js")(category_router);

    // const skill_router = express.Router();
    // router.use("/skill", skill_router);
    // require("./skill/skill.js")(skill_router);

    // const article_router = express.Router();
    // router.use("/article", article_router);
    // require("./article/article.js")(article_router);

    // const question_router = express.Router();
    // router.use("/question", question_router);
    // require("./question/question.js")(question_router);

};