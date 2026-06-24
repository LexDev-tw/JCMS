const newsService = require('../services/newsService');
const { wrapAsyncController } = require('../middleware/controllerAsyncWrap');

const getNews = wrapAsyncController(async (req, res) => {
    const data = await newsService.getNewsAll();
    res.set('Cache-Control', 'public, max-age=60');
    res.status(200).json(data);
});

module.exports = {
    getNews,
};
