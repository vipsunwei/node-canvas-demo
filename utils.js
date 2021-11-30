const axios = require("axios");
const echarts = require("node-echarts-canvas");
const chalk = require("chalk");
const { promisify } = require("util");
const request = require("request");
const post = promisify(request.post);
const baseUrl = "https://sonde.r7tec.com";

const red = chalk.bold.red;
const orange = chalk.keyword("orange");
const green = chalk.bold.green;
const yellow = chalk.bold.yellow;
const blueBright = chalk.bold.blueBright;

function info(options, typeText, msg = "") {
  const stationText = `${yellow(options.station)}`;
  const tkyidText = `${yellow(options.tkyid)}`;
  const m = `${stationText} - ${tkyidText} - ${typeText} - ${blueBright(msg)}`;
  console.log(m);
}
function warning(msg = "") {
  console.log(orange(msg));
}
function err(msg = "") {
  console.log(red(msg));
}
function success(msg = "") {
  console.log(chalk.blue(msg));
}

/**
 * 保留n位小数
 * @param {number|string} v 源数据
 * @param {number} n 保留小数点后 n 位，默认保留2位小数
 * @returns {string}
 */
function toFixedFilter(v, n = 2) {
  const arr = [0, "0"];
  if (arr.includes(v)) return v;
  if (!v) return "";
  return typeof v === "number" ? +v.toFixed(n) : +(+v).toFixed(n);
}

/**
 * 30倍抽析，并且只保留每条数据的经纬度和最后一条数据的海拔信息
 * @param {array} fdata
 */
function formatStationDataSet(fdata) {
  const last = fdata.pop();
  const lastTimeHeight = Number(last.aboveSeaLevel);
  const lnglat = [];
  fdata.forEach((value, i) => {
    if (i % 30 == 0) {
      lnglat.push([Number(value.longitude), Number(value.latitude)]);
    }
  });
  lnglat.push([Number(last.longitude), Number(last.latitude)]);
  return [lnglat, lastTimeHeight];
}

/**
 * 把经纬度海拔为空为0的去掉
 * @param {array} data 探空仪历史数据数组
 */
function deleteZero(data) {
  return data.filter((item) => item.longitude && item.latitude && Number(item.aboveSeaLevel));
}

/**
 * 返回以站号为key，探空仪数据为value的对象结构
 * @param {array} dataSetArr 原始（非质控）数据数组
 * @param {array} stationArr 站号数组
 */
function formatDataSet(dataSetArr, stationArr) {
  const r = {};
  dataSetArr.forEach(({ data }, i) => {
    const fdata = deleteZero(data);
    const [lnglat, lastTimeHeight] = formatStationDataSet(fdata);
    r[stationArr[i].station] = { lnglat, lastTimeHeight };
  });
  return r;
}
/**
 * 获取探空仪原始（非质控）数据
 * @param {array} options 包含站号和探空仪ID的对象数组
 */
async function getDataSetHandler(options) {
  const url = `${baseUrl}/api/dataset/view.json`;
  let dataSet = {};
  try {
    const promiseArr = [];
    options.forEach((item) => {
      if (item.station && item.tkyid) {
        const p = http(url, item, "raw");
        promiseArr.push(p);
      }
    });
    const dataSetArr = await Promise.all(promiseArr);
    dataSet = formatDataSet(dataSetArr, options);
  } catch (error) {
    err(error.message);
    console.trace(error);
    console.log("获取探空仪原始数据报错：url=" + url, "参数=" + JSON.stringify(options));
  }
  return dataSet;
}

/**
 * 转换探空仪厂家
 * @param {string} firm 探空仪厂家代码字符串
 * @returns {string} 探空仪厂家中文字符串
 */
function tanslateFirm(firm) {
  if (typeof firm !== "number") {
    firm = Number(firm);
  }
  const firmMap = new Map([
    [7, "华云天仪熔断"],
    [10, "华云升达"],
    [11, "华云天仪"],
    [20, "上海长望"],
    [30, "太原无线电一厂"],
    [40, "航天新气象"],
    [50, "南京大桥"],
  ]);

  const factory = firmMap.get(firm) || "--";

  return factory;
}
/**
 * 根据站号和探空仪ID获取探空仪信息
 * @param {object} opt 对象
 * @param {string|number} opt.station 站号
 * @param {string} opt.tkyid 探空仪ID
 * @returns {object}
 */
function getSondeData(opt) {
  const { station, tkyid } = opt;
  const url = baseUrl + "/project/TK_TKY_STAT_DATA.query.do";
  return post(url, {
    form: {
      _query_param: JSON.stringify([
        { FD: "STATION_NUMBER", OP: "=", WD: station },
        { FD: "TKYID", OP: "=", WD: tkyid },
      ]),
    },
  }).then((res) => {
    const fieldMap = {
      TKYID: "tkyid",
      FLY_START_TIME: "startTime",
      FINISHED_TIME: "endTime",
      STATION_NAME: "stationName",
      STATION_NUMBER: "stationNum",
      TKY_FIRM: "firm",
    };
    let sondeData = {};
    try {
      const result = JSON.parse(res.body);
      if (result._MSG_.startsWith("ERROR") || result._RTN_CODE_ === "ERROR") {
        err(JSON.stringify({ message: "获取探空仪数据失败", body: res.body }));
      } else {
        const _DATA_ = result._DATA_;
        if (_DATA_.length) {
          const sonde = _DATA_[0];
          Object.keys(fieldMap).forEach((key) => {
            sondeData[fieldMap[key]] = sonde[key];
          });
        }
      }
    } catch (error) {
      err(error.message);
      console.trace(error);
      console.log("getLastSondeDataByStation报错：url=" + url, "站号=" + station);
    }
    return sondeData;
  });
}
/**
 * 根据站号获取探空仪最后一条数据
 * @param {string} station 站号
 */
function getLastSondeDataByStation(station) {
  const url = baseUrl + "/project/TK_TKY_STAT_DATA.query.do";
  return post(url, {
    form: {
      _query_param: JSON.stringify([{ FD: "STATION_NUMBER", OP: "=", WD: station }]),
      data: JSON.stringify({ _PAGE_: { NOWPAGE: 1, SHOWNUM: 1, ORDER: "FINISHED_TIME desc" } }),
    },
  }).then((res) => {
    const sondeData = {
      tkyid: "",
      startTime: "",
      endTime: "",
      stationName: "",
      stationNum: "",
      factoryName: "",
    };
    try {
      const result = JSON.parse(res.body);
      if (result._MSG_.startsWith("ERROR") || result._RTN_CODE_ === "ERROR") {
        err(JSON.stringify({ message: "获取探空仪数据失败", body: res.body }));
      } else {
        const _DATA_ = result._DATA_;
        if (_DATA_.length) {
          const sonde = _DATA_[0];
          sondeData.startTime = sonde.FLY_START_TIME;
          sondeData.endTime = sonde.EXPLOSION_TIME;
          sondeData.tkyid = sonde.TKYID;
          sondeData.stationName = sonde.STATION_NAME;
          sondeData.stationNum = sonde.STATION_NUMBER;
          sondeData.factoryName = tanslateFirm(sonde.TKY_FIRM);
        }
      }
    } catch (error) {
      err(error.message);
      console.trace(error);
      console.log("getLastSondeDataByStation报错：url=" + url, "站号=" + station);
    }
    return sondeData;
  });
}

/**
 * 返回数据对象，按站号为key，探空仪数据为value的结构
 * @param {array} sondeDataArr 探空仪数据数组
 * @param {array} stationArr 站号数组
 */
function formatSondeDataByStation(sondeDataArr, stationArr) {
  const r = {};
  sondeDataArr.forEach((data, i) => {
    r[stationArr[i]] = data;
  });
  return r;
}
/**
 * 深度合并对象
 * 如果target(也就是FirstOBJ[key])存在，
 * 且是对象的话再去调用deepObjectMerge，
 * 否则就是FirstOBJ[key]里面没这个对象，需要与SecondOBJ[key]合并
 */
function deepObjectMerge(FirstOBJ = {}, SecondOBJ = {}) {
  for (const key in SecondOBJ) {
    FirstOBJ[key] =
      FirstOBJ[key] && FirstOBJ[key].toString() === "[object Object]"
        ? deepObjectMerge(FirstOBJ[key], SecondOBJ[key])
        : (FirstOBJ[key] = SecondOBJ[key]);
  }
  return FirstOBJ;
}

/**
 * 根据参数获取画图所需的数据
 * @param {object} options 参数对象
 * @returns {promise} 网络请求返回的promise对象
 */
function getDataForImage(options) {
  const url = `${baseUrl}/api/dataset/view.json`;
  if (!options.type || options.type !== "raw") {
    return http(url, options);
  } else {
    return http(url, options, "raw");
  }
}

/**
 * 判断要素值是否是个合法的数字
 * @param {object} param0
 * @param {object} param0.key
 * @param {object} param0.value
 */
function isNaN({ key, value }) {
  const commonErrArr = ["NaN", "99999.000000", null, undefined, "", 0, false];
  const aboveSeaLevelErrArr = [...commonErrArr, "0.000000"];
  if (key === "aboveSeaLevel") {
    return aboveSeaLevelErrArr.includes(value);
  }
  return commonErrArr.includes(value);
}
/**
 * 格式化echarts画图需要的data数组
 * @param {array} data 数组
 * @returns 数组 [温, 湿, 压, 高, 时间]
 */
function formatData(data) {
  const lineArr = [[], [], [], [], []];
  data.forEach((el) => {
    if (isNaN({ value: el.temperature }) || el.temperature > 200) {
      lineArr[0].push(NaN);
    } else {
      lineArr[0].push(Number(el.temperature));
    }
    if (isNaN({ value: el.humidity }) || el.humidity > 100) {
      lineArr[1].push(NaN);
    } else {
      lineArr[1].push(Number(el.humidity));
    }
    if (isNaN({ value: el.pressure }) || el.pressure > 2000) {
      lineArr[2].push(NaN);
    } else {
      lineArr[2].push(Number(el.pressure));
    }
    if (isNaN({ key: "aboveSeaLevel", value: el.aboveSeaLevel }) || el.aboveSeaLevel < 0) {
      lineArr[3].push(NaN);
    } else {
      lineArr[3].push(Number(el.aboveSeaLevel));
    }
    if (el.seconds) {
      const hours = new Date(el.seconds * 1000).getHours();
      const minutes = new Date(el.seconds * 1000).getMinutes();
      const seconds = new Date(el.seconds * 1000).getSeconds();
      lineArr[4].push(
        `${hours < 10 ? "0" + hours : hours}:${minutes < 10 ? "0" + minutes : minutes}:${
          seconds < 10 ? "0" + seconds : seconds
        }`
      );
    }
  });
  return lineArr;
}

/**
 * 请求接口获取生成图表所需要的数据
 * @param {string} url 请求数据的接口地址
 * @param {object} obj 参数对象
 * @param {string} obj.station 站号
 * @param {string} obj.tkyid 探空仪ID
 * @param {string} type "=raw"表示非质控，不传代表质控
 * @returns
 */
function http(url, obj, type) {
  const params = { station: obj.station, tkyid: obj.tkyid };
  if (type === "raw") {
    params.type = "raw";
  }
  return axios.get(url, { params });
}

/**
 * 把echarts出的图表转成base64字符串
 * @param {array} lineArr echarts画图需要的data数据数组
 * @param {object} options 接口收到的参数
 * @returns 图片的base64字符串
 */
function generateImageBase64(lineArr, options) {
  const config = {
    width: 950, // Image width, type is number.
    height: 300, // Image height, type is number.
    option: {}, // Echarts configuration, type is Object.
    //If the path  is not set, return the Buffer of image.
    path: "", // Path is filepath of the image which will be created.
    enableAutoDispose: true, //Enable auto-dispose echarts after the image is created.
  };
  const colors = ["#FF0000", "#00FF00", "#0000FF", "#000", "#F56CB5"];
  const defaultOptions = {
    enableAutoDispose: true,
    animation: false,
    backgroundColor: "#FFF",
    legend: {
      data: ["温度", "湿度", "压强", "海拔"],
    },
    xAxis: [
      {
        type: "category",
        minInterval: 100,
        data: [],
        axisLine: {
          show: false,
        },
        axisLabel: {
          show: false,
        },
        splitArea: {
          show: false,
        },
        axisTick: {
          show: false,
        },
      },
      {
        type: "category",
        minInterval: 100,
        data: [],
        axisLine: {
          show: false,
        },
        axisLabel: {
          show: false,
        },
        splitArea: {
          show: false,
        },
        axisTick: {
          show: false,
        },
      },
      {
        type: "category",
        minInterval: 100,
        data: [],
        axisLine: {
          show: false,
        },
        axisLabel: {
          show: false,
        },
        splitArea: {
          show: false,
        },
        axisTick: {
          show: false,
        },
      },
      {
        type: "category",
        minInterval: 100,
        data: [],
        position: "bottom",
        axisLabel: {
          showMinLabel: true,
          showMaxLabel: true,
        },
        axisLine: {
          lineStyle: {
            color: colors[0],
          },
        },
      },
    ],
    grid: {
      top: "18%",
      bottom: "14%",
      left: "18%",
      right: "18%",
    },
    dataZoom: [
      {
        id: "dataZoomX",
        type: "inside",
        xAxisIndex: [0, 1, 2, 3],
        filterMode: "30%",
      },
    ],
    yAxis: [
      {
        // scale: true,
        type: "value",
        name: "温度",
        axisLine: {
          lineStyle: {
            color: colors[0],
          },
        },
        splitLine: {
          show: false,
        },
      },
      {
        // scale: true,
        type: "value",
        name: "湿度",
        position: "left",
        offset: 36,
        axisLine: {
          lineStyle: {
            color: colors[1],
          },
        },
        splitLine: {
          show: false,
        },
      },
      {
        // scale: true,
        type: "value",
        name: "气压",
        position: "right",
        axisLine: {
          lineStyle: {
            color: colors[2],
          },
        },
        splitLine: {
          show: false,
        },
      },
      {
        // scale: true,
        type: "value",
        name: "海拔",
        position: "right",
        offset: 36,
        axisLine: {
          lineStyle: {
            color: colors[3],
          },
        },
        splitLine: {
          show: false,
        },
      },
    ],
    series: [
      {
        name: "温度",
        type: "line",
        sampling: "average",
        itemStyle: {
          color: colors[0],
        },
        data: [],
      },
      {
        name: "湿度",
        type: "line",
        yAxisIndex: 1,
        sampling: "average",
        itemStyle: {
          color: colors[1],
        },
        data: [],
      },
      {
        name: "压强",
        type: "line",
        yAxisIndex: 2,
        sampling: "average",
        itemStyle: {
          color: colors[2],
        },
        data: [],
      },
      {
        name: "海拔",
        type: "line",
        yAxisIndex: 3,
        sampling: "average",
        itemStyle: {
          color: colors[3],
        },
        data: [],
      },
    ],
  };
  // if (options.type === "raw") {
  defaultOptions.series[0].data = lineArr[1];
  defaultOptions.series[1].data = lineArr[2];
  defaultOptions.series[2].data = lineArr[3];
  defaultOptions.series[3].data = lineArr[4];
  // } else {
  //   defaultOptions.series[0].data = [...lineArr[1][0], ...lineArr[1][1], ...lineArr[1][2]];
  //   defaultOptions.series[1].data = [...lineArr[2][0], ...lineArr[2][1], ...lineArr[2][2]];
  //   defaultOptions.series[2].data = [...lineArr[3][0], ...lineArr[3][1], ...lineArr[3][2]];
  //   defaultOptions.series[3].data = [...lineArr[4][0], ...lineArr[4][1], ...lineArr[4][2]];
  // }
  defaultOptions.xAxis[0].data = lineArr[0];
  defaultOptions.xAxis[1].data = lineArr[0];
  defaultOptions.xAxis[2].data = lineArr[0];
  defaultOptions.xAxis[3].data = lineArr[0];

  // defaultOptions.series[0].data = lineArr[0];
  // defaultOptions.series[1].data = lineArr[1];
  // defaultOptions.series[2].data = lineArr[2];
  // defaultOptions.series[3].data = lineArr[3];
  // defaultOptions.xAxis[0].data = lineArr[4];
  // defaultOptions.xAxis[1].data = lineArr[4];
  // defaultOptions.xAxis[2].data = lineArr[4];
  // defaultOptions.xAxis[3].data = lineArr[4];
  config.option = defaultOptions;
  const buffer = echarts(config);
  const base64 = Buffer.from(buffer, "utf8").toString("base64");
  // return "data:image/png;base64," + base64;
  return base64;
}

/**
 * 时间字符串转换成时间戳(秒)
 * @param {string} dateStr 时间字符串 例如：2020-10-10 20:34:23
 * @returns {number} 时间戳(秒)
 */
function dateStrToTimeStamp(dateStr) {
  const date = new Date(dateStr);
  const seconds = date.getTime() / 1000; //转换成秒；
  return seconds;
}

/**
 * 格式化熔断器数据，去除重复数据，增加前端易用属性
 * @param {array} fuseData 熔断数据数组
 * @param {number} startTime 开始时间(秒)时间戳
 * @returns [[time, ...], [aboveSeaLevel, ...]]
 */
function formatFuseData(fuseData, startTime) {
  // 将"2021-07-11T17:30:55.340Z"转成"2021-07-11 19:16:53"格式
  fuseData = fuseData.map((item) => {
    item.timeStamp = formatDate(new Date(item.timeStamp));
    return item;
  });
  // 按时间去除重复数据
  fuseData = uniqueFun(fuseData, "timeStamp");
  // 补空并重组数据结构
  fuseData = fillFuseData(fuseData, startTime);
  return fuseData;
}

/**
 * 补空并重组数据结构返回前端
 * @param {array} data 熔断数据
 * @param {number} startTime 开始时间（秒）
 * @returns {array} [[时间, ...], [海拔, ...]]
 */
function fillFuseData(data, startTime) {
  // x轴时间 ： HH:mm:ss
  const xArr = [];
  // 海拔
  const aboveSeaLevelArr = [];
  const raisingSpeedArr = [];
  // 经纬度： [lng, lat]
  const lnglat = [];
  data.forEach((el, i) => {
    const timeStamp = parseInt(+new Date(el.timeStamp) / 1000);
    if (timeStamp < startTime) return;
    if (i === 0) {
      let timeStamp = parseInt(+new Date(data[0].timeStamp) / 1000);
      let len = timeStamp - startTime;
      if (len > 1) {
        for (let j = 1; j < len; j++) {
          aboveSeaLevelArr.push(null);
          raisingSpeedArr.push(null);
          lnglat.push([null, null]);
          xArr.push(formatDate(new Date(startTime * 1000 + j * 1000), "HH:mm:ss"));
        }
      }
      aboveSeaLevelArr.push(formatAboveSeaLevel(data[0].aboveSeaLevel));
      raisingSpeedArr.push(toFixedFilter(data[0].raisingSpeed, 1));
      lnglat.push([toFixedFilter(data[0].longitude, 8), toFixedFilter(data[0].latitude, 8)]);
      xArr.push(formatDate(new Date(data[0].timeStamp), "HH:mm:ss"));
    } else {
      const len =
        parseInt(+new Date(el.timeStamp) / 1000) - parseInt(+new Date(data[i - 1].timeStamp) / 1000);
      if (len > 1) {
        for (let j = 1; j < len; j++) {
          aboveSeaLevelArr.push(null);
          raisingSpeedArr.push(null);
          lnglat.push([null, null]);
          xArr.push(formatDate(new Date(+new Date(data[i - 1].timeStamp) + j * 1000), "HH:mm:ss"));
        }
      }
      aboveSeaLevelArr.push(formatAboveSeaLevel(el.aboveSeaLevel));
      raisingSpeedArr.push(toFixedFilter(el.raisingSpeed, 1));
      lnglat.push([toFixedFilter(el.longitude, 8), toFixedFilter(el.latitude, 8)]);
      xArr.push(formatDate(new Date(el.timeStamp), "HH:mm:ss"));
    }
  });
  const lnglatArr = chouxi(lnglat);
  return [xArr, aboveSeaLevelArr, raisingSpeedArr, lnglatArr];
}

function chouxi(lnglat) {
  if (!lnglat || !Array.isArray(lnglat) || !lnglat.length) return [];
  // 倒着遍历，删除尾部无效数组元素，保证最后一个元素中的经纬度是可用的数据
  console.log("删除尾部无效经纬度之前的长度 = ", lnglat.length);
  for (let len = lnglat.length, i = len - 1; i >= 0; i--) {
    const el = lnglat[i];
    if (el[0] && el[1]) {
      break;
    }
    lnglat.splice(i, 1);
  }
  console.log("删除尾部无效经纬度之后的长度 = ", lnglat.length);
  // 对经纬度做30倍抽析
  const lnglatArr = [];
  const last = lnglat.pop();
  lnglat.forEach((v, i) => {
    if (i % 30 === 0) {
      lnglatArr.push(v);
    }
  });
  lnglatArr.push(last);
  console.log("30倍抽析后的长度 = ", lnglatArr.length);
  return lnglatArr;
}

/**
 * 判断阈值
 * @param {string} firm 厂家编号
 * @returns {object} {max: 0, normal: 0, min: 0}
 */
function getThreshold(firm) {
  let val = {
    max: 0,
    normal: 0,
    min: 0,
  };
  switch (firm) {
    case "10":
      val.normal = 3.95;
      val.max = Number((3.95 + 1.55).toFixed(2));
      val.min = Number((3.95 - 1.55).toFixed(2));
      break;
    case "11":
      val.normal = 3.95;
      val.max = Number((3.95 + 1.55).toFixed(2));
      val.min = Number((3.95 - 1.55).toFixed(2));
      break;
    case "20":
      val.normal = 4.2;
      val.max = Number((4.2 + 2).toFixed(2));
      val.min = Number((4.2 - 2).toFixed(2));
      break;
    case "30":
      val.normal = 7.5;
      val.max = Number((7.5 + 1.5).toFixed(2));
      val.min = Number((7.5 - 1.5).toFixed(2));
      break;
    case "40":
      val.normal = 6;
      val.max = Number((6 + 2).toFixed(2));
      val.min = Number((6 - 2).toFixed(2));
      break;
    case "50":
      val.normal = 5;
      val.max = Number((5 + 0.2).toFixed(2));
      val.min = Number((5 - 0.2).toFixed(2));
      break;
    default:
      break;
  }
  return val;
}

/**
 * 根据探空仪ID和站号获取开始时间和结束时间
 * 20210804增加返回threshold阀值
 * @param {object} options
 * @param {string} options.station
 * @param {string} options.tkyid
 */
function getSondeTime(options) {
  const { station, tkyid } = options;
  const url = baseUrl + "/project/TK_TKY_STAT_DATA.query.do";
  return post(url, {
    form: {
      _query_param: JSON.stringify([
        { FD: "STATION_NUMBER", OP: "=", WD: station },
        { FD: "TKYID", OP: "=", WD: tkyid },
      ]),
    },
  }).then((res) => {
    const sondeTime = { startTime: "", endTime: "", threshold: { max: 0, normal: 0, min: 0 } };
    try {
      const result = JSON.parse(res.body);
      if (result._MSG_.startsWith("ERROR") || result._RTN_CODE_ === "ERROR") {
        err(JSON.stringify({ message: "获取开始与结束时间失败", body: res.body }));
      } else {
        const _DATA_ = result._DATA_;
        if (_DATA_.length) {
          const sondeData = _DATA_[0];
          sondeTime.startTime = dateStrToTimeStamp(sondeData.FLY_START_TIME).toString();
          sondeTime.endTime = dateStrToTimeStamp(sondeData.FINISHED_TIME).toString();
          sondeTime.threshold = getThreshold((sondeData.TKY_FIRM - 0).toString());
        }
      }
    } catch (error) {
      err(error.message);
      console.trace(error);
      console.log("getSondeTime报错：url=" + url, "站号=" + station, "探空仪ID=" + tkyid);
    }
    return sondeTime;
  });
}

/**
 * 获取探空仪或熔断器数据
 * @param {object} options
 * @param {string} options.sondeCode 探空仪ID或熔断器ID
 * @param {string} options.startTime
 * @param {string} options.endTime
 * @param {string} options.step
 */
function getSoundingMsg(options) {
  // const url = "http://192.168.10.39:18082/api/dataset/getSoundingMsg";
  const url = baseUrl + "/api/dataset/getSoundingMsg";
  const params = {
    sondeCode: options.sondeCode,
    startTime: options.startTime,
    endTime: options.endTime,
    // pixel: "0",
    step: options.step || "0",
  };
  return axios
    .get(url, { params })
    .then((res) => Object.values(res.data.data))
    .catch((error) =>
      console.log(
        "getSoundingMsg报错：url=" + url,
        "参数=" + JSON.stringify(params),
        "errMsg=" + error.message
      )
    );
}

/**
 * 获取熔断器ID
 * @param {string} sondeCode 探空仪ID
 */
function getFuseId(sondeCode) {
  const url = baseUrl + "/project/TK_SONDE_FUSE.query.do";
  return post(url, {
    form: {
      _query_param: JSON.stringify([{ FD: "SONDECODE", OP: "=", WD: sondeCode }]),
    },
  }).then((res) => {
    let fuseId = "";
    try {
      const result = JSON.parse(res.body);
      if (result._MSG_.startsWith("ERROR") || result._RTN_CODE_ === "ERROR") {
        err(JSON.stringify({ message: "获取熔断器ID失败", body: res.body }));
      } else {
        const _DATA_ = result._DATA_;
        if (_DATA_.length) {
          fuseId = _DATA_[0]?.FUSECODE;
        }
      }
    } catch (error) {
      err(error.message);
      console.trace(error);
      console.log("getFuseId报错：url=" + url, "探空仪ID=" + sondeCode);
    }
    return fuseId;
  });
}

/**
 * 生成高程图base64数据
 * @param {array} sondeData 探空仪数据
 * @param {array} fuseData 熔断器数据
 * @param {object} options 接口收到的参数
 */
function generateHeightImageBase64(sondeData, fuseData, options) {
  const type = options.type;
  const config = {
    width: 950, // Image width, type is number.
    height: 300, // Image height, type is number.
    option: {}, // Echarts configuration, type is Object.
    //If the path  is not set, return the Buffer of image.
    path: "", // Path is filepath of the image which will be created.
    enableAutoDispose: true, //Enable auto-dispose echarts after the image is created.
  };
  const colors = [
    "#FF0000",
    "#00FF00",
    "#0000FF",
    "#000",
    "#FF4343",
    "#67FF67",
    "#6A6AFF",
    "#5D5D5D",
    "#FF8B8B",
    "#B7FCB7",
    "#B4B4FC",
    "#A2A2A2",
  ];
  const heightOption = {
    backgroundColor: "#fff",
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "cross",
      },
      formatter(params) {
        let str = "";
        for (var i = 0; i < params.length; i++) {
          if (params[i].seriesName === "探空仪") {
            str += `${params[i].seriesName}：${
              isNaN(params[i].data) ? "暂无" : params[i].data.toFixed(1) + "m"
            }<br>`;
          } else if (params[i].seriesName === "熔断器") {
            str += `${params[i].seriesName}：${
              isNaN(params[i].data) ? "暂无" : params[i].data.toFixed(1) + "m"
            }`;
          }
        }
        return str;
      },
    },
    animation: false,
    legend: {
      data: ["探空仪", "熔断器"],
    },
    xAxis: [
      {
        type: "category",
        minInterval: 100,
        data: [],
        position: "bottom",
        axisLabel: {
          showMinLabel: true,
          showMaxLabel: true,
        },
        axisLine: {
          lineStyle: {
            color: colors[3],
          },
        },
      },
    ],
    grid: {
      top: "18%",
      bottom: "14%",
      left: "18%",
      right: "18%",
    },
    dataZoom: [
      {
        id: "dataZoomX",
        type: "inside",
        // xAxisIndex: [0, 1, 2, 3],
        filterMode: "30%",
      },
    ],
    yAxis: [
      {
        type: "value",
        name: "海拔",
        axisLine: {
          lineStyle: {
            color: colors[3],
          },
        },
      },
    ],
    series: [
      {
        name: "探空仪",
        type: "line",
        sampling: "average",
        itemStyle: {
          color: colors[3],
        },
        data: [],
      },
      {
        name: "熔断器",
        type: "line",
        sampling: "average",
        itemStyle: {
          color: colors[0],
        },
        data: [],
      },
    ],
  };
  let sondeAboveSeaLevelArr = [];
  if (type === "raw") {
    sondeAboveSeaLevelArr = sondeData[4];
  } else {
    sondeAboveSeaLevelArr = [...sondeData[4][0], ...sondeData[4][1], ...sondeData[4][2]];
  }
  let xSondeAboveSeaLevelArr = sondeData[0];
  heightOption.series[0].data = sondeAboveSeaLevelArr;
  heightOption.xAxis[0].data = xSondeAboveSeaLevelArr;

  let xFuseAboveSeaLevelArr = fuseData[0];
  let fuseAboveSeaLevelArr = fuseData[1];
  heightOption.series[1].data = fuseAboveSeaLevelArr;

  if (xSondeAboveSeaLevelArr.length < xFuseAboveSeaLevelArr.length) {
    let len = xFuseAboveSeaLevelArr.length - xSondeAboveSeaLevelArr.length;
    for (let i = 0; i < len; i++) {
      heightOption.series[0].data.push(NaN);
    }
    heightOption.xAxis[0].data = xFuseAboveSeaLevelArr;
  }

  // let sondeAboveSeaLevelArr = sondeData[3];
  // let xSondeAboveSeaLevelArr = sondeData[4];
  // heightOption.series[0].data = sondeAboveSeaLevelArr;
  // heightOption.xAxis[0].data = xSondeAboveSeaLevelArr;

  // let xFuseAboveSeaLevelArr = fuseData[0];
  // let fuseAboveSeaLevelArr = fuseData[1];
  // heightOption.series[1].data = fuseAboveSeaLevelArr;

  // if (xSondeAboveSeaLevelArr.length < xFuseAboveSeaLevelArr.length) {
  //   let len = xFuseAboveSeaLevelArr.length - xSondeAboveSeaLevelArr.length;
  //   for (let i = 0; i < len; i++) {
  //     heightOption.series[0].data.push(NaN);
  //   }
  //   heightOption.xAxis[0].data = xFuseAboveSeaLevelArr;
  // }

  config.option = heightOption;
  const buffer = echarts(config);
  const base64 = Buffer.from(buffer, "utf8").toString("base64");
  return base64;
}

/**
 * 为获取熔断器接口组织参数
 * @param {object} options 包含站号和探空仪ID
 */
async function getOptionForFuse(options) {
  const { tkyid } = options;
  const result = { sondeCode: "", startTime: "", endTime: "", threshold: { max: 0, normal: 0, min: 0 } };
  try {
    const fuseId = await getFuseId(tkyid);
    result.sondeCode = fuseId;
  } catch (error) {
    err(error.message);
    console.trace(error);
  }
  try {
    const sondeTime = await getSondeTime(options);
    result.startTime = sondeTime.startTime;
    result.endTime = sondeTime.endTime && String(Number(sondeTime.endTime) + 6 * 60 * 60); // 结束时间外扩6小时
    result.threshold = sondeTime.threshold;
  } catch (error) {
    err(error.message);
    console.trace(error);
  }
  return result;
}

/**
 * 对象数组去重方法
 * @param {array} arr 待去重的数组
 * @param {string} key 对象属性，根据这个属性去重
 * @returns {array}
 */
function arrayToDistinct(arr, key) {
  let obj2 = {};
  return arr.reduce((prev, item) => {
    obj2[item[key]] ? "" : (obj2[item[key]] = true && prev.push(item));
    return prev;
  }, []);
}

/**
 * 对象数组去重
 * @param {array} arr 待去重的数组
 * @param {string} type 对象属性，根据这个属性区中
 * @returns {array}
 */
function uniqueFun(arr, type) {
  const res = new Map();
  return arr.filter((a) => !res.has(a[type]) && res.set(a[type], 1));
}

/**
 * 筛选对象属性
 * @param {object} obj 对象
 * @param {array} fields 要保留的对象属性
 * @returns {object}
 */
function filterFields(obj, fields) {
  let temp = {};
  fields.forEach((item) => {
    temp[item] = "segmemt" === item ? obj[item] : obj[item];
  });
  return temp;
}

/**
 * 格式化日期
 * @param date
 * @param {string} format 默认："yyyy-MM-dd HH:mm:ss"
 * @return {string} 日期时间字符串
 */
function formatDate(date = new Date(), format = "yyyy-MM-dd HH:mm:ss") {
  const o = {
    "M+": date.getMonth() + 1, // 月份
    "d+": date.getDate(), // 日
    "H+": date.getHours(), // 小时
    "m+": date.getMinutes(), // 分
    "s+": date.getSeconds(), // 秒
    "q+": Math.floor((date.getMonth() + 3) / 3), // 季度
    S: date.getMilliseconds(), // 毫秒
  };
  if (/(y+)/.test(format)) {
    format = format.replace(RegExp.$1, (date.getFullYear() + "").substr(4 - RegExp.$1.length));
  }
  for (const k in o) {
    if (new RegExp("(" + k + ")").test(format)) {
      format = format.replace(
        RegExp.$1,
        RegExp.$1.length === 1 ? o[k] : ("00" + o[k]).substr(("" + o[k]).length)
      );
    }
  }
  return format;
}

/**
 * 格式化温度的值
 * @param {number|string} temperature 温度
 * @returns {number|null}
 */
function formatTemperature(temperature) {
  if (temperature === "NaN" || !temperature || temperature === "99999.000000" || temperature > 200) {
    return null;
  }
  return Number(temperature).toFixed(1) - 0;
}

/**
 * 格式化湿度的值
 * @param {number|string} humidity 湿度
 * @returns {number|null}
 */
function formatHumidity(humidity) {
  if (humidity === "NaN" || !humidity || humidity === "99999.000000" || humidity > 120) {
    return null;
  }
  return Number(humidity).toFixed(1) - 0;
}

/**
 * 格式化气压的值
 * @param {number|string} pressure 气压
 * @returns {number|null}
 */
function formatPressure(pressure) {
  if (pressure === "NaN" || !pressure || pressure === "99999.000000" || pressure > 2000) {
    return null;
  }
  return Number(pressure).toFixed(1) - 0;
}

/**
 * 格式化海拔的值
 * @param {number|string} aboveSeaLevel 海拔
 * @returns {number|null}
 */
function formatAboveSeaLevel(aboveSeaLevel) {
  if (
    aboveSeaLevel === "NaN" ||
    aboveSeaLevel === NaN ||
    !aboveSeaLevel ||
    aboveSeaLevel === "99999.000000" ||
    aboveSeaLevel === "0.000000" ||
    aboveSeaLevel < 0 ||
    aboveSeaLevel >= 40000
  ) {
    return null;
  }
  return Number(aboveSeaLevel).toFixed(1) - 0;
}

/**
 * 格式化探空仪原始数据用于画廓线图
 * @param {array} sondeRawData 待格式化的探空仪数据数组
 * @returns {array}
 */
function formatSondeRawDataset(sondeRawData = []) {
  console.log("探空仪原始数据 = " + sondeRawData.length);
  // 去重
  // sondeRawData = arrayToDistinct(sondeRawData, "seconds");
  sondeRawData = uniqueFun(sondeRawData, "seconds");
  // 把segmemt为空的，取前一条数据中的segmemt补到空的位置上
  // sondeRawData = fillSegmemt(sondeRawData);
  const uCount = sondeRawData.length;
  console.log("探空仪数据去重后余 = " + uCount);
  // sondeRawData = removeSegmemt(sondeRawData);
  // const nonSegmemtCount = uCount - sondeRawData.length;
  // console.log("没有标记位的有 = " + nonSegmemtCount);
  // 补空并重组返回结构
  sondeRawData = fillSondeRawData(sondeRawData);
  // 保留用到的属性，可减小接口返回数据size
  // sondeRawData = sondeRawData.map((item) =>
  //   filterFields(item, ["segmemt", "aboveSeaLevel", "temperature", "pressure", "humidity", "seconds"])
  // );
  return sondeRawData;
}

/**
 * 格式化探空仪数据用于画廓线图
 * @param {array} sondeData 待格式化的探空仪数据数组
 * @returns {array}
 */
function formatSondeDataset(sondeData = []) {
  console.log("探空仪数据 = " + sondeData.length);
  // 去重
  // sondeRawData = arrayToDistinct(sondeRawData, "seconds");
  sondeData = uniqueFun(sondeData, "seconds");
  // 把segmemt为空的，取前一条数据中的segmemt补到空的位置上
  sondeData = fillSegmemt(sondeData);
  const uCount = sondeData.length;
  console.log("探空仪数据去重后余 = " + uCount);
  sondeData = removeSegmemt(sondeData);
  const nonSegmemtCount = uCount - sondeData.length;
  console.log("没有标记位的有 = " + nonSegmemtCount);
  // 补空并重组返回结构
  sondeData = fillSondeData(sondeData);
  // 保留用到的属性，可减小接口返回数据size
  // sondeData = sondeData.map((item) =>
  //   filterFields(item, ["segmemt", "aboveSeaLevel", "temperature", "pressure", "humidity", "seconds"])
  // );
  return sondeData;
}

/**
 * 把segmemt为空的，取前一条的segmemt值，补上
 * @param {array} data 去重后的探空仪数据数组
 * @returns {array}
 */
function fillSegmemt(data) {
  data.forEach((el, i) => {
    if (i === 0) {
      return;
    }
    !el.segmemt && (el.segmemt = data[i - 1].segmemt);
  });
  return data;
}
/**
 * 把segmemt为空的去掉
 * @param {array} data 探空仪数据数组
 * @returns {array}
 */
function removeSegmemt(data) {
  return data.filter((item) => item.segmemt);
}

/**
 * 补空并重组返回结构
 * @param {array} data
 * @returns {array}
 * [
 *    [time, ...],
 *    [[UP:temperature, ...], [HOR:temperature, ...], [DOWN:temperature, ...]],
 *    [[UP:humidity, ...], [HOR:humidity, ...], [DOWN:humidity, ...]],
 *    [[UP:pressure, ...], [HOR:pressure, ...], [DOWN:pressure, ...]],
 *    [[UP:aboveSeaLevel, ...], [HOR:aboveSeaLevel, ...], [DOWN:aboveSeaLevel, ...]]
 * ]
 */
function fillSondeRawData(data) {
  let xArr = [],
    temperatureArr = [],
    humidityArr = [],
    pressureArr = [],
    aboveSeaLevelArr = [];
  let lnglatArr = [];
  data.forEach((el, i) => {
    if (i === 0) {
      xArr.push(formatDate(new Date(el.seconds * 1000), "HH:mm:ss"));
      temperatureArr.push(formatTemperature(el.temperature));
      humidityArr.push(formatHumidity(el.humidity));
      pressureArr.push(formatPressure(el.pressure));
      aboveSeaLevelArr.push(formatAboveSeaLevel(el.aboveSeaLevel));
      lnglatArr.push([toFixedFilter(el.longitude, 8), toFixedFilter(el.latitude, 8)]);
      // temperatureArr = setTemperatureArr(temperatureArr, el);
      // humidityArr = setHumidityArr(humidityArr, el);
      // pressureArr = setPressureArr(pressureArr, el);
      // aboveSeaLevelArr = setAboveSeaLevelArr(aboveSeaLevelArr, el);
    } else {
      const seconds = data[i - 1].seconds;
      const len = el.seconds - seconds;
      if (len > 1) {
        for (let j = 1; j < len; j++) {
          xArr.push(formatDate(new Date(seconds * 1000 + j * 1000), "HH:mm:ss"));
          temperatureArr.push(null);
          humidityArr.push(null);
          pressureArr.push(null);
          aboveSeaLevelArr.push(null);
          lnglatArr.push([null, null]);
          // temperatureArr = setTemperatureArr(temperatureArr, el, null);
          // humidityArr = setHumidityArr(humidityArr, el, null);
          // pressureArr = setPressureArr(pressureArr, el, null);
          // aboveSeaLevelArr = setAboveSeaLevelArr(aboveSeaLevelArr, el, null);
        }
      }
      xArr.push(formatDate(new Date(el.seconds * 1000), "HH:mm:ss"));
      temperatureArr.push(formatTemperature(el.temperature));
      humidityArr.push(formatHumidity(el.humidity));
      pressureArr.push(formatPressure(el.pressure));
      aboveSeaLevelArr.push(formatAboveSeaLevel(el.aboveSeaLevel));
      lnglatArr.push([toFixedFilter(el.longitude, 8), toFixedFilter(el.latitude, 8)]);
      // temperatureArr = setTemperatureArr(temperatureArr, el);
      // humidityArr = setHumidityArr(humidityArr, el);
      // pressureArr = setPressureArr(pressureArr, el);
      // aboveSeaLevelArr = setAboveSeaLevelArr(aboveSeaLevelArr, el);
    }
  });

  lnglatArr = chouxi(lnglatArr);

  return [xArr, temperatureArr, humidityArr, pressureArr, aboveSeaLevelArr, lnglatArr];
}
/**
 * 补空并重组返回结构
 * @param {array} data
 * @returns {array}
 * [
 *    [time, ...],
 *    [[UP:temperature, ...], [HOR:temperature, ...], [DOWN:temperature, ...]],
 *    [[UP:humidity, ...], [HOR:humidity, ...], [DOWN:humidity, ...]],
 *    [[UP:pressure, ...], [HOR:pressure, ...], [DOWN:pressure, ...]],
 *    [[UP:aboveSeaLevel, ...], [HOR:aboveSeaLevel, ...], [DOWN:aboveSeaLevel, ...]]
 * ]
 */
function fillSondeData(data) {
  let xArr = [],
    temperatureArr = [[], [], []],
    humidityArr = [[], [], []],
    pressureArr = [[], [], []],
    aboveSeaLevelArr = [[], [], []];
  let lnglatArr = [];
  data.forEach((el, i) => {
    if (i === 0) {
      xArr.push(formatDate(new Date(el.seconds * 1000), "HH:mm:ss"));
      temperatureArr = setTemperatureArr(temperatureArr, el);
      humidityArr = setHumidityArr(humidityArr, el);
      pressureArr = setPressureArr(pressureArr, el);
      aboveSeaLevelArr = setAboveSeaLevelArr(aboveSeaLevelArr, el);
      lnglatArr.push([toFixedFilter(el.longitude, 8), toFixedFilter(el.latitude, 8)]);
    } else {
      const seconds = data[i - 1].seconds;
      const len = el.seconds - seconds;
      if (len > 1) {
        for (let j = 1; j < len; j++) {
          xArr.push(formatDate(new Date(seconds * 1000 + j * 1000), "HH:mm:ss"));
          temperatureArr = setTemperatureArr(temperatureArr, el, null);
          humidityArr = setHumidityArr(humidityArr, el, null);
          pressureArr = setPressureArr(pressureArr, el, null);
          aboveSeaLevelArr = setAboveSeaLevelArr(aboveSeaLevelArr, el, null);
          lnglatArr.push([null, null]);
        }
      }
      xArr.push(formatDate(new Date(el.seconds * 1000), "HH:mm:ss"));
      temperatureArr = setTemperatureArr(temperatureArr, el);
      humidityArr = setHumidityArr(humidityArr, el);
      pressureArr = setPressureArr(pressureArr, el);
      aboveSeaLevelArr = setAboveSeaLevelArr(aboveSeaLevelArr, el);
      lnglatArr.push([toFixedFilter(el.longitude, 8), toFixedFilter(el.latitude, 8)]);
    }
  });

  lnglatArr = chouxi(lnglatArr);

  return [xArr, temperatureArr, humidityArr, pressureArr, aboveSeaLevelArr, lnglatArr];
}

function setTemperatureArr(temperatureArr, el, fill) {
  el.segmemt === "UP" &&
    (fill === null
      ? temperatureArr[0].push(null)
      : temperatureArr[0].push(formatTemperature(el.temperature)));
  el.segmemt === "HOR" &&
    (fill === null
      ? temperatureArr[1].push(null)
      : temperatureArr[1].push(formatTemperature(el.temperature)));
  el.segmemt === "DOWN" &&
    (fill === null
      ? temperatureArr[2].push(null)
      : temperatureArr[2].push(formatTemperature(el.temperature)));
  return temperatureArr;
}

function setHumidityArr(humidityArr, el, fill) {
  el.segmemt === "UP" &&
    (fill === null ? humidityArr[0].push(null) : humidityArr[0].push(formatHumidity(el.humidity)));
  el.segmemt === "HOR" &&
    (fill === null ? humidityArr[1].push(null) : humidityArr[1].push(formatHumidity(el.humidity)));
  el.segmemt === "DOWN" &&
    (fill === null ? humidityArr[2].push(null) : humidityArr[2].push(formatHumidity(el.humidity)));
  return humidityArr;
}

function setPressureArr(pressureArr, el, fill) {
  el.segmemt === "UP" &&
    (fill === null ? pressureArr[0].push(null) : pressureArr[0].push(formatPressure(el.pressure)));
  el.segmemt === "HOR" &&
    (fill === null ? pressureArr[1].push(null) : pressureArr[1].push(formatPressure(el.pressure)));
  el.segmemt === "DOWN" &&
    (fill === null ? pressureArr[2].push(null) : pressureArr[2].push(formatPressure(el.pressure)));
  return pressureArr;
}

function setAboveSeaLevelArr(aboveSeaLevelArr, el, fill) {
  el.segmemt === "UP" &&
    (fill === null
      ? aboveSeaLevelArr[0].push(null)
      : aboveSeaLevelArr[0].push(formatAboveSeaLevel(el.aboveSeaLevel)));
  el.segmemt === "HOR" &&
    (fill === null
      ? aboveSeaLevelArr[1].push(null)
      : aboveSeaLevelArr[1].push(formatAboveSeaLevel(el.aboveSeaLevel)));
  el.segmemt === "DOWN" &&
    (fill === null
      ? aboveSeaLevelArr[2].push(null)
      : aboveSeaLevelArr[2].push(formatAboveSeaLevel(el.aboveSeaLevel)));
  return aboveSeaLevelArr;
}

/**
 * 格式化设备信息
 * @param {array} data
 * @param {object} threshold 阀值
 * @returns {array}
 */
function formatEquipmentData(data, threshold) {
  const equipmentData = [[], [], [], [], [], []];
  data.forEach((el, i) => {
    if (
      i !== 0 &&
      data[i].seconds &&
      data[i - 1].seconds &&
      Math.ceil(data[i].seconds - data[i - 1].seconds) > 1
    ) {
      for (let j = 0; j < Math.ceil(data[i].seconds - data[i - 1].seconds) - 1; j++) {
        equipmentData[0].push(
          formatDate(
            new Date(new Date(data[i - 1].seconds * 1000).getTime() + 1000 * (j + 1)),
            "yyyy-MM-dd HH:mm:ss"
          )
        );
        equipmentData[1].push(null);
        equipmentData[2].push(null);
        equipmentData[3].push(null);
        equipmentData[4].push(threshold.max);
        equipmentData[5].push(threshold.min);
      }
    }
    equipmentData[0].push(formatDate(new Date(el.seconds * 1000), "yyyy-MM-dd HH:mm:ss"));
    equipmentData[1].push(el.batteryVol);
    equipmentData[2].push(el.freqz);
    equipmentData[3].push(el.rssi);
    equipmentData[4].push(threshold.max);
    equipmentData[5].push(threshold.min);
  });

  return equipmentData;
}

/**
 * 生成设备信息图base64
 * @param {array} deviceInfo
 * @returns {string}
 */
function generateDeviceInfoImageBase64(deviceInfo) {
  const config = {
    width: 950, // Image width, type is number.
    height: 300, // Image height, type is number.
    option: {}, // Echarts configuration, type is Object.
    //If the path  is not set, return the Buffer of image.
    path: "", // Path is filepath of the image which will be created.
    enableAutoDispose: true, //Enable auto-dispose echarts after the image is created.
  };
  const colors = ["#FF4B00", "#4681FF", "#61A0A8"];
  const option = {
    backgroundColor: "#fff",
    // title: { text: "设备信息图" },
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "cross",
      },
    },
    animation: false,
    legend: {
      data: ["电压", "频率", "信号强度", "电压上限", "电压下限"],
    },
    xAxis: [
      {
        type: "category",
        minInterval: 100,
        data: [],
        position: "bottom",
        axisLabel: {
          showMinLabel: true,
          showMaxLabel: true,
        },
      },
      {
        type: "category",
        minInterval: 100,
        data: [],
        axisLine: {
          show: false,
        },
        axisLabel: {
          show: false,
        },
        splitArea: {
          show: false,
        },
        axisTick: {
          show: false,
        },
      },
      {
        type: "category",
        minInterval: 100,
        data: [],
        axisLine: {
          show: false,
        },
        axisLabel: {
          show: false,
        },
        splitArea: {
          show: false,
        },
        axisTick: {
          show: false,
        },
      },
    ],
    grid: {
      top: "18%",
      bottom: "14%",
      left: "18%",
      right: "18%",
    },
    dataZoom: [
      {
        id: "dataZoomX",
        type: "inside",
        xAxisIndex: [0, 1, 2],
        filterMode: "30%",
      },
    ],
    yAxis: [
      {
        type: "value",
        name: "电压",
        // min: dataMin,
        // max: dataMax,
        axisLine: {
          lineStyle: {
            color: colors[0],
          },
        },
        splitLine: {
          show: false,
        },
      },
      {
        type: "value",
        name: "频率",
        position: "left",
        max: 406,
        min: 400,
        offset: 36,
        axisLine: {
          lineStyle: {
            color: colors[1],
          },
        },
        splitLine: {
          show: false,
        },
      },
      {
        type: "value",
        name: "信号强度",
        position: "right",
        // min: dataMin,
        // max: dataMax,
        axisLine: {
          lineStyle: {
            color: colors[2],
          },
        },
        splitLine: {
          show: false,
        },
      },
      {
        type: "value",
        name: "",
        // min: dataMin,
        // max: dataMax,
        axisLine: {
          lineStyle: {
            color: "#000",
          },
        },
        splitLine: {
          show: false,
        },
      },
      {
        type: "value",
        name: "",
        // min: dataMin,
        // max: dataMax,
        axisLine: {
          lineStyle: {
            color: "#000",
          },
        },
        splitLine: {
          show: false,
        },
      },
    ],
    series: [
      {
        name: "电压",
        type: "line",
        sampling: "average",
        itemStyle: {
          color: colors[0],
        },
        data: [],
      },
      {
        name: "频率",
        type: "line",
        sampling: "average",
        yAxisIndex: 1,
        itemStyle: {
          color: colors[1],
        },
        data: [],
      },
      {
        name: "信号强度",
        type: "line",
        sampling: "average",
        yAxisIndex: 2,
        itemStyle: {
          color: colors[2],
        },
        data: [],
      },
      {
        name: "电压上限",
        type: "line",
        sampling: "average",
        itemStyle: {
          color: colors[0],
        },
        lineStyle: {
          type: "dashed",
        },
        data: [],
      },
      {
        name: "电压下限",
        type: "line",
        sampling: "average",
        itemStyle: {
          color: colors[0],
        },
        lineStyle: {
          type: "dashed",
        },
        data: [],
      },
    ],
  };

  option.xAxis[0].data = deviceInfo[0];
  option.xAxis[1].data = deviceInfo[0];
  option.xAxis[2].data = deviceInfo[0];
  option.series[0].data = deviceInfo[1];
  option.series[1].data = deviceInfo[2];
  option.series[2].data = deviceInfo[3];
  option.series[3].data = deviceInfo[4];
  option.series[4].data = deviceInfo[5];

  config.option = option;
  const buffer = echarts(config);
  const base64 = Buffer.from(buffer, "utf8").toString("base64");
  return base64;
}

module.exports = {
  getThreshold,
  getSondeData,
  filterFields,
  uniqueFun,
  arrayToDistinct,
  info,
  warning,
  err,
  success,
  http,
  baseUrl,
  deepObjectMerge,
  formatSondeDataByStation,
  getLastSondeDataByStation,
  tanslateFirm,
  formatStationDataSet,
  deleteZero,
  formatDataSet,
  getDataSetHandler,
  getDataForImage,
  getOptionForFuse,
  getSoundingMsg,
  generateHeightImageBase64,
  formatData,
  generateImageBase64,
  generateDeviceInfoImageBase64,
  getFuseId,
  formatDate,
  formatTemperature,
  formatHumidity,
  formatPressure,
  formatAboveSeaLevel,
  formatSondeRawDataset,
  formatSondeDataset,
  fillSondeRawData,
  fillSondeData,
  formatFuseData,
  toFixedFilter,
  formatEquipmentData,
};
