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

function info(options, msg = "") {
  const stationText = `${yellow(options.station)}`;
  const tkyidText = `${yellow(options.tkyid)}`;
  const typeText = options.type === "raw" ? yellow("非质控") : yellow("质控");
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
 * 30倍抽析，并且只保留每条数据的经纬度和最后一条数据的海拔信息
 * @param {array} fdata
 */
function formatStationDataSet(fdata) {
  console.log("抽析前", fdata.length);
  const last = fdata.pop();
  console.log("pop后", fdata.length);
  const lastTimeHeight = Number(last.aboveSeaLevel);
  const lnglat = [];
  fdata.forEach((value, i) => {
    if (i % 30 == 0) {
      lnglat.push([Number(value.longitude), Number(value.latitude)]);
    }
  });
  lnglat.push([Number(last.longitude), Number(last.latitude)]);
  console.log("抽析后", lnglat.length);
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
  let dataSet = {};
  try {
    const promiseArr = [];
    options.forEach((item) => {
      const url = `${baseUrl}/api/dataset/view.json`;
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
    [7, "华云天仪"],
    [10, "华云升达"],
    [11, "华云天仪"],
    [20, "上海长望"],
    [30, "太原"],
    [40, "航天新气象"],
    [50, "南京大桥"],
  ]);

  const factory = firmMap.get(firm) || "--";

  return factory;
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
    const sondeData = { tkyid: "", startTime: "", endTime: "", stationName: "", stationNum: "", factoryName: "" };
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
 * @returns 数组
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
 * @returns 图片的base64字符串
 */
function generateImageBase64(lineArr) {
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
  defaultOptions.series[0].data = lineArr[0];
  defaultOptions.series[1].data = lineArr[1];
  defaultOptions.series[2].data = lineArr[2];
  defaultOptions.series[3].data = lineArr[3];
  defaultOptions.xAxis[0].data = lineArr[4];
  defaultOptions.xAxis[1].data = lineArr[4];
  defaultOptions.xAxis[2].data = lineArr[4];
  defaultOptions.xAxis[3].data = lineArr[4];
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
 * 格式化探空仪画图数据
 * @param {array} data
 */
function formatSondeData(data) {
  const lineArr = [];
  const arr = [];
  let difference = 0;
  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  try {
    data.forEach((el, i) => {
      if (el.seconds) {
        if (i !== 0) {
          difference =
            parseInt(new Date(el.seconds).getTime() / 1000) - parseInt(new Date(data[i - 1].seconds).getTime() / 1000);
          if (difference >= 1) {
            for (let i = 0; i < difference - 1; i++) {
              lineArr.push("NaN");
              hours = new Date((el.seconds + i) * 1000).getHours();
              minutes = new Date((el.seconds + i) * 1000).getMinutes();
              seconds = new Date((el.seconds + i) * 1000).getSeconds();
              arr.push(
                `${hours < 10 ? "0" + hours : hours}:${minutes < 10 ? "0" + minutes : minutes}:${
                  seconds < 10 ? "0" + seconds : seconds
                }`
              );
            }
          }
        }
        if (i !== 0 && new Date(el.seconds).getTime() !== new Date(data[i - 1].seconds).getTime()) {
          if (
            el.aboveSeaLevel === "NaN" ||
            !el.aboveSeaLevel ||
            el.aboveSeaLevel === "99999.000000" ||
            el.aboveSeaLevel === "0.000000" ||
            el.aboveSeaLevel < 0
          ) {
            lineArr.push("NaN");
          } else {
            lineArr.push(Number(el.aboveSeaLevel));
          }
          hours = new Date(el.seconds * 1000).getHours();
          minutes = new Date(el.seconds * 1000).getMinutes();
          seconds = new Date(el.seconds * 1000).getSeconds();
          arr.push(
            `${hours < 10 ? "0" + hours : hours}:${minutes < 10 ? "0" + minutes : minutes}:${
              seconds < 10 ? "0" + seconds : seconds
            }`
          );
        }
      }
    });
  } catch (error) {}
  return [lineArr, arr];
}

/**
 * 格式化熔断器画图数据
 * @param {array} data
 * @param {number} startTime
 */
function formatFuseData(data, startTime) {
  const lineArr = [];
  const arr = [];
  let difference = 0;
  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  try {
    data.forEach((el, i) => {
      if (el.timeStamp && new Date(el.timeStamp).getTime() >= startTime) {
        if (i !== 0) {
          difference =
            parseInt(new Date(el.timeStamp).getTime() / 1000) -
            parseInt(new Date(data[i - 1].timeStamp).getTime() / 1000);
          if (difference >= 1) {
            for (let i = 0; i < difference - 1; i++) {
              lineArr.push("NaN");
              hours = new Date(new Date(el.timeStamp).getTime() + 1000 * i).getHours();
              minutes = new Date(new Date(el.timeStamp).getTime() + 1000 * i).getMinutes();
              seconds = new Date(new Date(el.timeStamp).getTime() + 1000 * i).getSeconds();
              arr.push(
                `${hours < 10 ? "0" + hours : hours}:${minutes < 10 ? "0" + minutes : minutes}:${
                  seconds < 10 ? "0" + seconds : seconds
                }`
              );
            }
          }
        }
        if (
          el.aboveSeaLevel === "NaN" ||
          !el.aboveSeaLevel ||
          el.aboveSeaLevel === "99999.000000" ||
          el.aboveSeaLevel === "0.000000" ||
          el.aboveSeaLevel < 0 ||
          el.aboveSeaLevel >= 40000
        ) {
          lineArr.push("NaN");
        } else {
          lineArr.push(Number(el.aboveSeaLevel));
        }
        hours = new Date(el.timeStamp).getHours();
        minutes = new Date(el.timeStamp).getMinutes();
        seconds = new Date(el.timeStamp).getSeconds();
        arr.push(
          `${hours < 10 ? "0" + hours : hours}:${minutes < 10 ? "0" + minutes : minutes}:${
            seconds < 10 ? "0" + seconds : seconds
          }`
        );
      }
    });
  } catch (error) {}
  return [lineArr, arr];
}
/**
 * 根据探空仪ID和站号获取开始时间和结束时间
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
    const sondeTime = { startTime: "", endTime: "" };
    try {
      const result = JSON.parse(res.body);
      if (result._MSG_.startsWith("ERROR") || result._RTN_CODE_ === "ERROR") {
        err(JSON.stringify({ message: "获取开始与结束时间失败", body: res.body }));
      } else {
        const _DATA_ = result._DATA_;
        if (_DATA_.length) {
          sondeTime.startTime = dateStrToTimeStamp(_DATA_[0].FLY_START_TIME).toString();
          sondeTime.endTime = dateStrToTimeStamp(_DATA_[0].FINISHED_TIME).toString();
        }
      }
    } catch (error) {
      err(error.message);
      console.trace(error);
    }
    return sondeTime;
  });
}

/**
 * 获取熔断器数据
 * @param {object} options
 * @param {string} options.sondeCode
 * @param {string} options.startTime
 * @param {string} options.endTime
 * @param {string} options.pixel
 */
function getSoundingMsg(options) {
  // const url = "http://192.168.10.39:18082/api/dataset/getSoundingMsg";
  const url = baseUrl + "/api/dataset/getSoundingMsg";
  const params = {
    sondeCode: options.sondeCode,
    startTime: options.startTime,
    endTime: options.endTime,
    pixel: "0",
  };
  return axios.get(url, { params }).then((res) => Object.values(res.data.data));
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
    }
    return fuseId;
  });
}

/**
 * 生成高程图base64数据
 * @param {object} data
 * @param {array} data.sondeData 探空仪数据
 * @param {array} data.fuseData 熔断器数据
 * @param {number} data.startTime 放球开始时间
 */
function generateHeightImageBase64({ sondeData, fuseData, startTime }) {
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
            str += `${params[i].seriesName}：${isNaN(params[i].data) ? "暂无" : params[i].data.toFixed(1) + "m"}<br>`;
          } else if (params[i].seriesName === "熔断器") {
            str += `${params[i].seriesName}：${isNaN(params[i].data) ? "暂无" : params[i].data.toFixed(1) + "m"}`;
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
  const [sondeLineArr, sondeArr] = formatSondeData(sondeData);

  heightOption.series[0].data = sondeLineArr;
  heightOption.xAxis[0].data = sondeArr;

  const [fuseLineArr, fuseArr] = formatFuseData(fuseData, startTime);
  heightOption.series[1].data = fuseLineArr;

  if (sondeArr.length < fuseArr.length) {
    for (let i = 0; i < fuseArr.length - sondeArr.length; i++) {
      heightOption.series[0].data.push(NaN);
    }
    heightOption.xAxis[0].data = fuseArr;
  }

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
  const result = { sondeCode: "", startTime: "", endTime: "" };
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
    result.endTime = sondeTime.endTime;
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

module.exports = {
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
  getFuseId,
};