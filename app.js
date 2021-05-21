const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const axios = require("axios");
const echarts = require("node-echarts-canvas");
const chalk = require("chalk");
const config = {
  width: 950, // Image width, type is number.
  height: 300, // Image height, type is number.
  option: {}, // Echarts configuration, type is Object.
  //If the path  is not set, return the Buffer of image.
  path: "", // Path is filepath of the image which will be created.
  enableAutoDispose: true, //Enable auto-dispose echarts after the image is created.
};

const baseUrl = "https://sonde.r7tec.com";
const url = `${baseUrl}/api/dataset/view.json`;
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
 * 根据参数获取画图所需的数据
 * @param {object} options 参数对象
 * @returns {promise} 网络请求返回的promise对象
 */
function getDataForImage(options) {
  if (!options.type || options.type !== "raw") {
    return http(url, options);
  } else {
    return http(url, options, "raw");
  }
}
/**
 * 接口处理函数
 * @param {object} options 参数对象
 * @returns {string} 图片base64串
 */
async function imageHandler(options) {
  try {
    console.log();
    info(options, `开始`);
    const st = new Date() - 0;
    const { data } = await getDataForImage(options);
    const diff = +new Date() - st;
    info(options, `请求数据${diff / 1000}秒`);
    // console.log("返回的数据 -- ", data);
    const lineArr = formatData(data);
    const imgBase64 = generateImageBase64(lineArr);
    info(options, `结束`);
    return imgBase64;
  } catch (error) {
    throw error;
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
    if (
      isNaN({ key: "aboveSeaLevel", value: el.aboveSeaLevel }) ||
      el.aboveSeaLevel < 0
    ) {
      lineArr[3].push(NaN);
    } else {
      lineArr[3].push(Number(el.aboveSeaLevel));
    }
    if (el.seconds) {
      const hours = new Date(el.seconds * 1000).getHours();
      const minutes = new Date(el.seconds * 1000).getMinutes();
      const seconds = new Date(el.seconds * 1000).getSeconds();
      lineArr[4].push(
        `${hours < 10 ? "0" + hours : hours}:${
          minutes < 10 ? "0" + minutes : minutes
        }:${seconds < 10 ? "0" + seconds : seconds}`
      );
    }
  });
  return lineArr;
}

/**
 * 请求接口获取生成图表所需要的数据
 * @param {string} url 请求数据的接口地址
 * @param {object} obj 参数对象
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

const app = express();
const port = 3000;

app.use(cors());
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }));
// parse application/json
app.use(bodyParser.json());

// 处理/image路由请求
app.post("/image", function (request, response) {
  const options = request?.body;
  if (!options || !options.station) {
    response.status(400).send("parameter 'station' is empty!");
    warning("parameter 'station' is empty!");
    return;
  }
  if (!options || !options.tkyid) {
    response.status(400).send("parameter 'tkyid' is empty!");
    warning("parameter 'tkyid' is empty!");
    return;
  }

  console.time("total");
  imageHandler(options)
    .then((result) => {
      response.send(result);
      info(options);
      console.timeEnd("total");
    })
    .catch((error) => {
      err("500 报错信息： " + JSON.stringify(error));
      response.status(500).send(error);
    });
});

app.listen(port, () => {
  success(`app listening at port:${port}`);
});
