const {
  info,
  warning,
  err,
  getDataForImage,
  getOptionForFuse,
  getSoundingMsg,
  generateHeightImageBase64,
} = require("./utils.js");

async function heightImageHandler(options) {
  console.log();
  info(options, `开始`);
  const st = new Date() - 0;
  // 获取质控后的数据
  let sondeData = [];
  let startTime = "";
  try {
    const res = await getDataForImage(options);
    sondeData = res.data;
    startTime = sondeData[0].seconds * 1000;
  } catch (error) {
    err(error.message);
    console.trace(error);
  }

  // 获取熔断器数据所需参数
  let optionForFuse = {};
  try {
    optionForFuse = await getOptionForFuse(options);
    if (!startTime) startTime = optionForFuse.startTime;
  } catch (error) {
    err(error.message);
    console.trace(error);
  }
  // 获取熔断器数据
  let fuseData = [];
  try {
    fuseData = await getSoundingMsg(optionForFuse);
  } catch (error) {
    err(error.message);
    console.trace(error);
  }
  const diff = +new Date() - st;
  info(options, `请求数据${diff / 1000}秒`);
  // console.log("返回的数据 -- ", fuseData);
  let imgBase64 = "";
  try {
    imgBase64 = generateHeightImageBase64({
      sondeData,
      fuseData,
      startTime,
    });
  } catch (error) {
    err(error.message);
    console.trace(error);
  }
  info(options, `结束`);
  return imgBase64;
}

/**
 * 处理/heightImage 路由请求
 * @param req.body.station
 * @param req.body.tkyid
 */
function heightImage(req, res) {
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

  heightImageHandler(options)
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

module.exports = heightImage;
