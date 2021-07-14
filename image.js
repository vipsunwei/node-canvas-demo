const {
  info,
  warning,
  err,
  getDataForImage,
  // formatData,
  generateImageBase64,
  formatSondeDataset,
} = require("./utils.js");

/**
 * 接口处理函数
 * @param {object} options 参数对象
 * @returns {string} 图片base64串
 */
async function imageHandler(options) {
  try {
    const st = new Date() - 0;
    const { data } = await getDataForImage(options);
    const diff = +new Date() - st;
    info(options, `请求数据${diff / 1000}秒`);
    // console.log("返回的数据 -- ", data);
    const fdata = formatSondeDataset(data);
    // const imgBase64 = formatData(data);
    const imgBase64 = generateImageBase64(fdata);
    return imgBase64;
  } catch (error) {
    err(error.message);
    console.trace(error);
  }
}

/**
 * 处理/image路由请求
 * @param req.body.station
 * @param req.body.tkyid
 * @param req.body.type raw非质控 不传或传空字符串为质控
 */
function image(req, res) {
  const options = req?.body;
  if (!options || !options.station) {
    res.status(400).send("parameter 'station' is empty!");
    warning("parameter 'station' is empty!");
    return;
  }
  if (!options || !options.tkyid) {
    res.status(400).send("parameter 'tkyid' is empty!");
    warning("parameter 'tkyid' is empty!");
    return;
  }

  imageHandler(options)
    .then((result) => {
      res.send(result);
      info(options);
    })
    .catch((error) => {
      err("500 报错信息： " + error.message);
      console.trace(error);
      res.status(500).send(error);
    });
}

module.exports = image;
