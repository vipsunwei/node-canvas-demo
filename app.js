const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const compression = require("compression");
const { success } = require("./utils");
const app = express();
const port = 3000;

app.use(cors());
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }));
// parse application/json
app.use(bodyParser.json());

app.use(compression());

// 探空仪廓线图
const image = require("./image.js");
app.post("/image", image);

// 熔断器高程（度）图
const heightImage = require("./height_image.js");
app.post("/heightImage", heightImage);

// 历史轨迹数据
const getHistoryLine = require("./get_history_line.js");
app.post("/api/node/dataset/gethistoryline", getHistoryLine);

// 探空仪数据画图，包含属性：温、湿、压、海拔、时间
const sondeDataForEcharts = require("./sonde_data_for_echarts.js");
app.post("/api/node/dataset/sondedataforecharts", sondeDataForEcharts);

// 从MongoDB库导出探空仪或熔断器原始数据
const exportSondeData = require("./export_sonde_data.js");
app.get("/api/node/dataset/exportsondedata", exportSondeData);

app.listen(port, () => {
  success(`app listening at port:${port}`);
});
