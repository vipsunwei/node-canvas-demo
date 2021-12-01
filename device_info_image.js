const {
  info,
  warning,
  err,
  getSoundingMsg,
  generateDeviceInfoImageBase64,
  getOptionForFuse,
  formatEquipmentData,
  getSondeData,
  getThreshold,
  getDataForImage,
} = require("./utils.js");

/**
 * 接口处理函数
 * @param {object} options 参数对象
 * @returns {string} 图片base64串
 */
async function deviceInfoImageHandler(options) {
  /**
   * 1.根据探空仪ID和站号获取开始时间、结束时间、厂家编号，根据厂家编号使用getThreshold生成阀值对象信息
   * 2.根据探空仪ID、开始时间、结束时间获取数据
   * 3.
   */
  let sondeData = {};
  try {
    sondeData = await getSondeData(options);
  } catch (error) {
    err(error.message);
    console.trace(error);
  }

  console.log(sondeData);
  const { startTime, endTime, firm } = sondeData;
  // 获取熔断器数据
  let deviceInfo = undefined;
  const defaultRes = [[], [], [], [], [], []];
  try {
    const st = Date.now();
    /**
     * 2021-11-30修改：从view.json接口获取设备信息
     */
    // deviceInfo = await getSoundingMsg({
    //   sondeCode: options.tkyid,
    //   startTime: parseInt(+new Date(startTime) / 1000),
    //   endTime: parseInt(+new Date(endTime) / 1000) + 6 * 60 * 60,
    // });
    // if (!"type" in options || options.type !== "raw") options.type = "raw";
    const res = await getDataForImage({ ...options, type: "raw" });
    deviceInfo = res.data;
    const d = Date.now() - st;
    console.log("device info 第1条数据: ");
    console.log(deviceInfo?.[0]);
    info(options, "获取探空仪电压等信息数据", "用时：" + d / 1000 + "秒");
  } catch (error) {
    err(error.message);
    console.trace(error);
  }
  deviceInfo = !deviceInfo ? defaultRes : formatEquipmentData(deviceInfo, getThreshold(firm));
  // console.log("返回的数据 -- ", deviceInfo);
  let imgBase64 = "";
  try {
    imgBase64 = generateDeviceInfoImageBase64(deviceInfo);
  } catch (error) {
    err(error.message);
    console.trace(error);
  }
  return imgBase64;
}

/**
 * 处理/deviceInfoImage路由请求
 * @param req.body.station
 * @param req.body.tkyid
 */
function deviceInfoImage(req, res) {
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
  const st = Date.now();
  deviceInfoImageHandler(options)
    .then((result) => {
      res.send(result);
      const d = Date.now() - st;
      info(options, "生成设备信息图", `接口总用时：${d / 1000}秒`);
    })
    .catch((error) => {
      err("500 报错信息： " + error.message);
      console.trace(error);
      res.status(500).send(error);
    });
}

module.exports = deviceInfoImage;
