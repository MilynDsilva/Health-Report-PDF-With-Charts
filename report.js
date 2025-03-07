import 'chartjs-adapter-moment';
import PDFDocument from "pdfkit";
import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import moment from "moment-timezone";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TIMEZONE = "Asia/Kolkata";
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width: 800, height: 400 });

function filterDataByTimeframe(data, timeframeDays) {
    const now = moment().tz(TIMEZONE).startOf("day").valueOf();
    const startDate = now - (timeframeDays - 1) * 24 * 60 * 60 * 1000;
    return data.filter(d => d.measurementDate >= startDate);
}

function filterNutritionLogsByTimeframe(logs, timeframeDays) {
    const now = moment().tz(TIMEZONE).startOf("day").valueOf();
    const startDate = now - (timeframeDays - 1) * 24 * 60 * 60 * 1000;
    // Compare to `createdAt` instead of `measurementDate`
    return logs.filter(d => d.createdAt >= startDate);
}

async function generateTemperatureChart(data, benchmark, timeframeDays) {
    // Filter & sort logs by date so the line connects in chronological order
    const filteredData = filterDataByTimeframe(data, timeframeDays)
        .sort((a, b) => a.measurementDate - b.measurementDate);

    // Convert each log entry into a { x, y } point for Chart.js time scale
    const chartData = filteredData.map(d => ({
        x: d.measurementDate, // numeric timestamp
        y: d.value
    }));

    // Create a color array, one per data point
    const colors = filteredData.map(d => {
        const value = d.value;
        if (value == null) return "#C0C0C0";
        const { min, max } = benchmark.normalRange;
        if (value >= min && value <= max) return "#0047FF"; // normal
        if ((value >= min - 1 && value < min) || (value > max && value <= max + 1)) {
            return "#FFA63E"; // borderline
        }
        return "#FA114F"; // outlier
    });

    // For the dashed "normal temperature" line, we just plot two points:
    // one at the earliest date, one at the latest date, both at 'baseline' y.
    let baselineData = [];
    if (chartData.length > 0) {
        const earliest = chartData[0].x;
        const latest = chartData[chartData.length - 1].x;
        baselineData = [
            { x: earliest, y: benchmark.baseline },
            { x: latest, y: benchmark.baseline }
        ];
    }

    const configuration = {
        type: "line",
        data: {
            datasets: [
                {
                    label: "Temperature",
                    data: chartData,
                    borderColor: "#636363",
                    backgroundColor: "rgba(0,0,0,0)",
                    pointBackgroundColor: colors,
                    pointBorderColor: colors,
                    borderDash: [10, 10],
                    spanGaps: true
                },
                {
                    label: `Normal Temperature (${benchmark.baseline}°F)`,
                    data: baselineData,
                    borderColor: "#0047FF",
                    borderDash: [5, 5],
                    pointRadius: 0
                }
            ]
        },
        options: {
            scales: {
                x: {
                    type: "time",
                    time: {
                        tooltipFormat: "DD MMM YYYY, HH:mm",
                        displayFormats: {
                            hour: "DD MMM, HH:mm",
                            day: "DD MMM"
                        }
                    },
                    title: { display: true, text: "Date" }
                },
                y: {
                    title: { display: true, text: "Temperature °F" }
                }
            },
            plugins: {
                legend: { position: "bottom" }
            }
        }
    };

    return chartJSNodeCanvas.renderToBuffer(configuration);
}

async function generateHeartRateChart(data, benchmark, timeframeDays) {
    // Filter & sort logs by date so the line connects in chronological order
    const filteredData = filterDataByTimeframe(data, timeframeDays)
        .sort((a, b) => a.measurementDate - b.measurementDate);

    // Convert each log entry into a { x, y } point for Chart.js time scale
    const chartData = filteredData.map(d => ({
        x: d.measurementDate, // numeric timestamp
        y: d.value
    }));

    // Create a color array for each data point
    const colors = filteredData.map(d => {
        const value = d.value;
        if (value == null) return "#C0C0C0";
        const { min, max } = benchmark;
        if (value >= min && value <= max) return "#00B050"; // green
        if ((value >= min - 1 && value < min) || (value > max && value <= max + 1)) {
            return "#FFA63E"; // borderline
        }
        return "#FA114F"; // outlier
    });

    const configuration = {
        type: "line",
        data: {
            datasets: [
                {
                    label: "Heart Rate",
                    data: chartData,
                    borderColor: "#636363",
                    backgroundColor: "rgba(0,0,0,0)",
                    pointBackgroundColor: colors,
                    pointBorderColor: colors,
                    borderDash: [10, 10],
                    spanGaps: true
                }
            ]
        },
        options: {
            scales: {
                x: {
                    type: "time",
                    time: {
                        tooltipFormat: "DD MMM YYYY, HH:mm",
                        displayFormats: {
                            hour: "DD MMM, HH:mm",
                            day: "DD MMM"
                        }
                    },
                    title: { display: true, text: "Date" }
                },
                y: {
                    title: { display: true, text: "Heart Rate BPM" }
                }
            },
            plugins: {
                legend: { position: "bottom" }
            }
        }
    };

    return chartJSNodeCanvas.renderToBuffer(configuration);
}

function addHeaderFooterAbsolute(doc, patientInfo) {
    doc.save();

    // Header
    doc.fontSize(10)
        .text("Patient Health Report", doc.page.margins.left, 20, {
            width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
            align: "center",
            lineBreak: false
        });
    doc.text(`Name: ${patientInfo.name} | Age: ${patientInfo.age}`, doc.page.margins.left, 35, {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
        align: "center",
        lineBreak: false
    });
    doc.text(`Report Date: ${moment().tz(TIMEZONE).format("DD MMM YYYY")}`, doc.page.margins.left, 50, {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
        align: "center",
        lineBreak: false
    });

    // Footer
    doc.fontSize(8)
        .text("© 2025 Restore Me. All Rights Reserved.",
            doc.page.margins.left,
            doc.page.height - doc.page.margins.bottom - 20,
            {
                width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
                align: "center",
                lineBreak: false
            }
        );
    doc.restore();
}

/**
 * Generates a blood pressure chart (systolic + diastolic) over time.
 * - `logs`: Array of blood-pressure measurements (with `systolic`, `diastolic`, `measurementDate`).
 * - `benchMark`: The benchmark ranges for systolic and diastolic.
 * - `timeframeDays`: How many days of data to filter/display.
 */
async function generateBloodPressureChart(logs, benchMark, timeframeDays) {
    // Filter & sort logs by date
    const filteredData = filterDataByTimeframe(logs, timeframeDays)
        .sort((a, b) => a.measurementDate - b.measurementDate);

    // Prepare data arrays for Chart.js
    const systolicData = filteredData.map(d => ({ x: d.measurementDate, y: d.systolic }));
    const diastolicData = filteredData.map(d => ({ x: d.measurementDate, y: d.diastolic }));

    // Helper to classify a systolic value => color (Normal/Borderline/Outlier)
    function classifySystolic(value) {
        const { lowBorderline, normal, highBorderline, high } = benchMark.systolic;
        // Normal
        if (value >= normal.min && value <= normal.max) return "#00B050";
        // Borderline (either lowBorderline or highBorderline)
        if (
            (value >= lowBorderline.min && value <= lowBorderline.max) ||
            (value >= highBorderline.min && value <= highBorderline.max)
        ) {
            return "#FFA63E";
        }
        // Anything else => Outlier
        return "#FA114F";
    }

    // Helper to classify a diastolic value => color
    function classifyDiastolic(value) {
        const { lowBorderline, normal, highBorderline, high } = benchMark.diastolic;
        if (value >= normal.min && value <= normal.max) return "#00B050";
        if (
            (value >= lowBorderline.min && value <= lowBorderline.max) ||
            (value >= highBorderline.min && value <= highBorderline.max)
        ) {
            return "#FFA63E";
        }
        return "#FA114F";
    }

    // Create color arrays for each data point
    const systolicColors = filteredData.map(d => classifySystolic(d.systolic));
    const diastolicColors = filteredData.map(d => classifyDiastolic(d.diastolic));

    // Two datasets: one for SYS, one for DIA
    const configuration = {
        type: "line",
        data: {
            datasets: [
                {
                    label: "SYS",
                    data: systolicData,
                    borderColor: "#0047FF",              // Blue line
                    backgroundColor: "rgba(0,0,0,0)",
                    pointStyle: "rectRot",               // Square points
                    pointBackgroundColor: systolicColors,
                    pointBorderColor: systolicColors,
                    spanGaps: true
                },
                {
                    label: "DIA",
                    data: diastolicData,
                    borderColor: "#636363",              // Gray/black line
                    backgroundColor: "rgba(0,0,0,0)",
                    borderDash: [10, 10],                // Dashed line
                    pointStyle: "circle",                // Circle points
                    pointBackgroundColor: diastolicColors,
                    pointBorderColor: diastolicColors,
                    spanGaps: true
                }
            ]
        },
        options: {
            scales: {
                x: {
                    type: "time",
                    time: {
                        tooltipFormat: "DD MMM YYYY, HH:mm",
                        displayFormats: {
                            hour: "DD MMM, HH:mm",
                            day: "DD MMM"
                        }
                    },
                    title: { display: true, text: "Date" }
                },
                y: {
                    title: { display: true, text: "BP mmHg" }
                }
            },
            plugins: {
                legend: { position: "bottom" }
            }
        }
    };

    // Render chart to buffer
    return chartJSNodeCanvas.renderToBuffer(configuration);
}

/**
 * Generates a multi-line blood glucose chart with three categories:
 *  - FASTING
 *  - AFTER_A_MEAL
 *  - RANDOM
 *
 * Each category gets its own line color/style, and each data point
 * is color-coded (normal, borderline, outlier) based on the provided
 * benchmark ranges.
 */
async function generateBloodGlucoseChart(logs, benchMark, timeframeDays) {
    // 1) Filter & sort logs by date
    const filteredData = filterDataByTimeframe(logs, timeframeDays)
        .sort((a, b) => a.measurementDate - b.measurementDate);

    // 2) Separate logs by category
    const fastingLogs = filteredData.filter(d => d.category === "FASTING");
    const afterMealLogs = filteredData.filter(d => d.category === "AFTER_A_MEAL");
    const randomLogs = filteredData.filter(d => d.category === "RANDOM");

    // Helper: classify a glucose value => color (normal/borderline/outlier)
    // - FASTING => benchMark.beforeMeals
    // - AFTER_A_MEAL or RANDOM => benchMark.afterMealsAndRandom
    function classifyGlucose(value, category) {
        const ranges = (category === "FASTING")
            ? benchMark.beforeMeals
            : benchMark.afterMealsAndRandom;

        // Normal
        if (value >= ranges.normal.min && value <= ranges.normal.max) {
            return "#00B050"; // green
        }

        // Borderline if it’s in either lowBorderline or highBorderline
        const inLowBorder = (
            value >= ranges.lowBorderline.min && value <= ranges.lowBorderline.max
        );
        const inHighBorder = (
            value >= ranges.highBorderline.min && value <= ranges.highBorderline.max
        );
        if (inLowBorder || inHighBorder) {
            return "#FFA63E"; // orange borderline
        }

        // Otherwise, outlier
        return "#FA114F"; // red outlier
    }

    // Convert logs => Chart.js data points + store a color for each point
    function makeDatasetData(arr, category) {
        return arr.map(d => ({
            x: d.measurementDate,
            y: d.value,
            pointColor: classifyGlucose(d.value, category)
        }));
    }

    // 3) Define style for each category (line color, dash, point shape, etc.)
    const categoryStyles = {
        FASTING: {
            label: "Fasting",
            lineColor: "#800080",    // purple
            pointStyle: "circle",    // round points
            borderDash: []
        },
        AFTER_A_MEAL: {
            label: "After A Meal",
            lineColor: "#FF1493",    // pink
            pointStyle: "triangle",  // triangle points
            borderDash: []
        },
        RANDOM: {
            label: "Random",
            lineColor: "#0000FF",    // blue
            pointStyle: "rectRot",   // diamond
            borderDash: [10, 10]     // dashed line for "random"
        }
    };

    // Build an array of datasets—one per category that actually has data
    function buildDataset(logArr, category) {
        if (!logArr.length) return null;
        const dataPoints = makeDatasetData(logArr, category);
        const style = categoryStyles[category];
        return {
            label: style.label,
            data: dataPoints,
            borderColor: style.lineColor,
            backgroundColor: "rgba(0,0,0,0)",
            pointBackgroundColor: dataPoints.map(d => d.pointColor),
            pointBorderColor: dataPoints.map(d => d.pointColor),
            pointStyle: style.pointStyle,
            borderDash: style.borderDash,
            spanGaps: true
        };
    }

    const datasets = [];
    const fastingDataset = buildDataset(fastingLogs, "FASTING");
    if (fastingDataset) datasets.push(fastingDataset);

    const afterMealDataset = buildDataset(afterMealLogs, "AFTER_A_MEAL");
    if (afterMealDataset) datasets.push(afterMealDataset);

    const randomDataset = buildDataset(randomLogs, "RANDOM");
    if (randomDataset) datasets.push(randomDataset);

    // 4) Chart.js configuration
    const configuration = {
        type: "line",
        data: { datasets },
        options: {
            scales: {
                x: {
                    type: "time",
                    time: {
                        tooltipFormat: "DD MMM YYYY, HH:mm",
                        displayFormats: {
                            hour: "DD MMM, HH:mm",
                            day: "DD MMM"
                        }
                    },
                    title: { display: true, text: "Date" }
                },
                y: {
                    title: { display: true, text: "Blood Glucose mg/dL" }
                }
            },
            plugins: {
                legend: { position: "bottom" }
            }
        }
    };

    // 5) Render chart to image buffer
    return chartJSNodeCanvas.renderToBuffer(configuration);
}

async function generateNutritionChart(nutritionData, timeframeDays) {
    // 1) Filter & sort logs by date so the line is chronological
    const filteredLogs = filterNutritionLogsByTimeframe(nutritionData.logs, timeframeDays)
        .sort((a, b) => a.createdAt - b.createdAt);

    // 2) Convert logs => Chart.js data points
    //    We'll store the numeric timestamp in `x` and consumption in `y`.
    const consumptionData = filteredLogs.map(log => ({
        x: log.createdAt,
        y: log.consumed
    }));

    // 3) Classify each consumption => color (Normal, Borderline, Outlier)
    function classifyCalorie(value) {
        const { lowBorderline, normal, highBorderline } = nutritionData.benchMarks;
        // Outlier if < lowBorderline.min or > highBorderline.max
        if (value < lowBorderline.min || value > highBorderline.max) return "#FA114F"; // red
        // Borderline if in lowBorderline or highBorderline
        const inLow = (value >= lowBorderline.min && value <= lowBorderline.max);
        const inHigh = (value >= highBorderline.min && value <= highBorderline.max);
        if (inLow || inHigh) return "#FFA63E"; // orange
        // Otherwise, normal
        return "#00B050"; // green
    }

    // Create a color array for each data point
    const colors = filteredLogs.map(log => classifyCalorie(log.consumed));

    // 4) We'll add a single horizontal line for the "currentGoal" (e.g. 2900)
    let goalData = [];
    if (consumptionData.length > 0) {
        const earliest = consumptionData[0].x;
        const latest = consumptionData[consumptionData.length - 1].x;
        const goalY = nutritionData.currentGoal; // e.g. 2900
        goalData = [
            { x: earliest, y: goalY },
            { x: latest, y: goalY }
        ];
    }

    // 5) Build the Chart.js configuration
    const configuration = {
        type: "line",
        data: {
            datasets: [
                {
                    label: "Consumption",
                    data: consumptionData,
                    borderColor: "#636363",             // dotted grey line
                    backgroundColor: "rgba(0,0,0,0)",
                    borderDash: [10, 10],
                    pointBackgroundColor: colors,
                    pointBorderColor: colors,
                    spanGaps: true
                },
                {
                    label: `Goal (${nutritionData.currentGoal} ${nutritionData.unit})`,
                    data: goalData,
                    borderColor: "#0047FF",             // solid blue line
                    pointRadius: 0,
                    borderDash: []
                }
            ]
        },
        options: {
            scales: {
                x: {
                    type: "time",
                    time: {
                        tooltipFormat: "DD MMM YYYY",
                        displayFormats: {
                            day: "DD MMM"
                        }
                    },
                    title: { display: true, text: "Date" }
                },
                y: {
                    title: { display: true, text: `Calorie (${nutritionData.unit})` }
                }
            },
            plugins: {
                legend: { position: "bottom" }
            }
        }
    };

    // 6) Render chart to buffer & return
    return chartJSNodeCanvas.renderToBuffer(configuration);
}

/**
 * Generates a bar chart for daily water intake.
 * - Each bar is green if consumed <= goal, red if consumed > goal.
 * - X-axis is time-based, using createdAt.
 */
/**
 * Generates a stacked bar chart for water intake.
 * For each day:
 *   - If consumed < goal:
 *       Green bar from 0..consumed
 *       Blue bar from consumed..goal
 *       Red bar = 0
 *   - If consumed == goal:
 *       Entire bar is green (no blue leftover, no red excess)
 *   - If consumed > goal:
 *       Green bar from 0..goal
 *       Blue bar = 0
 *       Red bar from goal..consumed
 */
async function generateHydrationStackedChart(hydrateData, timeframeDays) {
    // 1) Filter & sort logs by date (using createdAt)
    const filteredLogs = filterNutritionLogsByTimeframe(hydrateData.logs, timeframeDays)
        .sort((a, b) => a.createdAt - b.createdAt);

    // 2) Prepare 3 separate datasets for stacked bars:
    //    - "Intake" (green)
    //    - "Goal" (blue leftover)
    //    - "Excess" (red above goal)
    const dataIntake = [];
    const dataGoal = [];
    const dataExcess = [];

    for (const log of filteredLogs) {
        const dateX = log.createdAt;
        const consumed = log.consumed;
        const goal = log.goal;

        if (consumed < goal) {
            // Consumed is below goal
            dataIntake.push({ x: dateX, y: consumed });      // green portion
            dataGoal.push({ x: dateX, y: goal - consumed }); // leftover goal in blue
            dataExcess.push({ x: dateX, y: 0 });             // no excess
        } else {
            // Consumed >= goal
            dataIntake.push({ x: dateX, y: Math.min(goal, consumed) }); // green portion up to the goal
            dataGoal.push({ x: dateX, y: 0 });                          // no leftover if consumed >= goal
            dataExcess.push({ x: dateX, y: consumed - goal });          // red portion above the goal (0 if equal)
        }
    }

    // 3) Build Chart.js config with 3 stacked bar datasets
    const configuration = {
        type: "bar",
        data: {
            datasets: [
                {
                    label: "Intake",
                    data: dataIntake,
                    backgroundColor: "#00B050" // green
                },
                {
                    label: "Goal",
                    data: dataGoal,
                    backgroundColor: "#0047FF" // blue
                },
                {
                    label: "Excess",
                    data: dataExcess,
                    backgroundColor: "#FA114F" // red
                }
            ]
        },
        options: {
            scales: {
                x: {
                    type: "time",
                    time: {
                        tooltipFormat: "DD MMM YYYY",
                        displayFormats: {
                            day: "DD MMM"
                        }
                    },
                    stacked: true, // Enable stacking on X axis
                    title: { display: true, text: "Date" }
                },
                y: {
                    stacked: true, // Enable stacking on Y axis
                    title: { display: true, text: `Milliliter (${hydrateData.unit})` }
                }
            },
            plugins: {
                legend: { position: "bottom" },
                tooltip: {
                    callbacks: {
                        // Show daily consumed & goal in tooltip
                        label: (context) => {
                            // context.raw is the { x, y } object from the dataset
                            const datasetLabel = context.dataset.label || "";
                            const val = context.parsed.y;
                            return `${datasetLabel}: ${val} ${hydrateData.unit}`;
                        }
                    }
                }
            }
        }
    };

    // 4) Render the chart to a buffer & return
    return chartJSNodeCanvas.renderToBuffer(configuration);
}


async function generatePDF(
    patientInfo,
    temperatureData,
    heartRateData,
    bloodPressureData,
    bloodGlucoseData,
    nutritionData,
    hydrateData,
    timeframeDays
) {
    try {
        const pdfPath = path.join(__dirname, `patient_report_${Date.now()}.pdf`);
        const doc = new PDFDocument({ size: "A4", margin: 50 });
        const stream = fs.createWriteStream(pdfPath);
        doc.pipe(stream);

        // Header/footer on the first page
        addHeaderFooterAbsolute(doc, patientInfo);
        doc.y = 70;

        doc.on("pageAdded", () => {
            addHeaderFooterAbsolute(doc, patientInfo);
            doc.y = 70;
        });

        // -------------------------
        // TEMPERATURE SECTION (unchanged)
        // -------------------------
        doc.fontSize(16)
            .text(`Body Temperature (Last ${timeframeDays} days)`, { align: "center" })
            .moveDown();

        const allTempValues = temperatureData.logs.map(log => log.value);
        const currentTemp = temperatureData.value || "-";
        const averageTemp = allTempValues.length
            ? (allTempValues.reduce((sum, v) => sum + v, 0) / allTempValues.length).toFixed(2)
            : "-";
        const lowestTempLog = allTempValues.length
            ? temperatureData.logs.reduce((min, log) => (log.value < min.value ? log : min))
            : null;
        const lowestTemp = lowestTempLog ? lowestTempLog.value : "-";
        const lowestTempDate = lowestTempLog
            ? moment(lowestTempLog.measurementDate).tz(TIMEZONE).format("DD MMM YYYY")
            : "-";

        doc.fontSize(12)
            .text(`Current Temperature: ${currentTemp}°F`, { align: "left" })
            .moveDown(0.5)
            .text(`Average Temperature: ${averageTemp}°F`, { align: "left" })
            .moveDown(0.5)
            .text(`Lowest Temperature: ${lowestTemp}°F on ${lowestTempDate}`, { align: "left" })
            .moveDown(1.5);

        const temperatureChartImage = await generateTemperatureChart(
            temperatureData.logs,
            temperatureData.benchMark,
            timeframeDays
        );
        doc.image(temperatureChartImage, {
            width: 550,
            align: "center",
            valign: "center",
            x: (doc.page.width - 550) / 2
        }).moveDown(3);

        doc.moveDown(100);
        // -------------------------
        // HEART RATE SECTION (unchanged)
        // -------------------------
        doc.fontSize(16)
            .text(`Heart Rate (Last ${timeframeDays} days)`, { align: "center" })
            .moveDown();

        const allHrValues = heartRateData.logs.map(log => log.value);
        const currentHr = heartRateData.value || "-";
        const averageHr = allHrValues.length
            ? (allHrValues.reduce((sum, v) => sum + v, 0) / allHrValues.length).toFixed(2)
            : "-";
        const lowestHrLog = allHrValues.length
            ? heartRateData.logs.reduce((min, log) => (log.value < min.value ? log : min))
            : null;
        const lowestHr = lowestHrLog ? lowestHrLog.value : "-";
        const lowestHrDate = lowestHrLog
            ? moment(lowestHrLog.measurementDate).tz(TIMEZONE).format("DD MMM YYYY")
            : "-";

        doc.fontSize(12)
            .text(`Current Heart Rate: ${currentHr} BPM`, { align: "left" })
            .moveDown(0.5)
            .text(`Average Heart Rate: ${averageHr} BPM`, { align: "left" })
            .moveDown(0.5)
            .text(`Lowest Heart Rate: ${lowestHr} BPM on ${lowestHrDate}`, { align: "left" })
            .moveDown(1.5);

        const heartRateChartImage = await generateHeartRateChart(
            heartRateData.logs,
            heartRateData.benchMark,
            timeframeDays
        );
        doc.image(heartRateChartImage, {
            width: 550,
            align: "center",
            valign: "center",
            x: (doc.page.width - 550) / 2
        }).moveDown(3);

        doc.moveDown(100);

        // -------------------------
        // BLOOD PRESSURE SECTION (NEW)
        // -------------------------
        // Only add if `bloodPressureData` is provided
        if (bloodPressureData) {
            doc.fontSize(16)
                .text(`Blood Pressure (Last ${timeframeDays} days)`, { align: "center" })
                .moveDown();

            // Extract arrays for systolic & diastolic
            const allSysValues = bloodPressureData.logs.map(log => log.systolic);
            const allDiaValues = bloodPressureData.logs.map(log => log.diastolic);

            // Current values from top-level object
            const currentSys = bloodPressureData.systolic || "-";
            const currentDia = bloodPressureData.diastolic || "-";

            const averageSys = allSysValues.length
                ? (allSysValues.reduce((sum, v) => sum + v, 0) / allSysValues.length).toFixed(2)
                : "-";
            const averageDia = allDiaValues.length
                ? (allDiaValues.reduce((sum, v) => sum + v, 0) / allDiaValues.length).toFixed(2)
                : "-";

            // Lowest systolic
            const lowestSysLog = allSysValues.length
                ? bloodPressureData.logs.reduce((min, log) => (log.systolic < min.systolic ? log : min))
                : null;
            const lowestSys = lowestSysLog ? lowestSysLog.systolic : "-";
            const lowestSysDate = lowestSysLog
                ? moment(lowestSysLog.measurementDate).tz(TIMEZONE).format("DD MMM YYYY")
                : "-";

            // Lowest diastolic
            const lowestDiaLog = allDiaValues.length
                ? bloodPressureData.logs.reduce((min, log) => (log.diastolic < min.diastolic ? log : min))
                : null;
            const lowestDia = lowestDiaLog ? lowestDiaLog.diastolic : "-";
            const lowestDiaDate = lowestDiaLog
                ? moment(lowestDiaLog.measurementDate).tz(TIMEZONE).format("DD MMM YYYY")
                : "-";

            doc.fontSize(12)
                .text(`Current BP: ${currentSys}/${currentDia} mmHg`, { align: "left" })
                .moveDown(0.5)
                .text(`Average BP: ${averageSys}/${averageDia} mmHg`, { align: "left" })
                .moveDown(0.5)
                .text(`Lowest Systolic: ${lowestSys} mmHg on ${lowestSysDate}`, { align: "left" })
                .moveDown(0.5)
                .text(`Lowest Diastolic: ${lowestDia} mmHg on ${lowestDiaDate}`, { align: "left" })
                .moveDown(1.5);

            // Render & embed the blood pressure chart
            const bloodPressureChartImage = await generateBloodPressureChart(
                bloodPressureData.logs,
                bloodPressureData.benchMark,
                timeframeDays
            );
            doc.image(bloodPressureChartImage, {
                width: 550,
                align: "center",
                valign: "center",
                x: (doc.page.width - 550) / 2
            }).moveDown(3);
        }

        doc.moveDown(100);

        if (bloodGlucoseData) {
            doc.addPage(); // optional: start a fresh page if desired

            doc.fontSize(16)
                .text(`Blood Glucose (Last ${timeframeDays} days)`, { align: "center" })
                .moveDown();

            // Prepare summary stats
            const allBgValues = bloodGlucoseData.logs.map(log => log.value);
            const currentBg = bloodGlucoseData.value || "-";
            const currentCategory = bloodGlucoseData.category || "-";
            const averageBg = allBgValues.length
                ? (allBgValues.reduce((sum, v) => sum + v, 0) / allBgValues.length).toFixed(2)
                : "-";

            const lowestBgLog = allBgValues.length
                ? bloodGlucoseData.logs.reduce((min, log) => (log.value < min.value ? log : min))
                : null;
            const lowestBg = lowestBgLog ? lowestBgLog.value : "-";
            const lowestBgDate = lowestBgLog
                ? moment(lowestBgLog.measurementDate).tz(TIMEZONE).format("DD MMM YYYY")
                : "-";

            doc.fontSize(12)
                .text(`Current Glucose: ${currentBg} mg/dL (Category: ${currentCategory})`, { align: "left" })
                .moveDown(0.5)
                .text(`Average Glucose: ${averageBg} mg/dL`, { align: "left" })
                .moveDown(0.5)
                .text(`Lowest Glucose: ${lowestBg} mg/dL on ${lowestBgDate}`, { align: "left" })
                .moveDown(1.5);

            // Render the new Blood Glucose chart
            const bloodGlucoseChartImage = await generateBloodGlucoseChart(
                bloodGlucoseData.logs,
                bloodGlucoseData.benchMark,
                timeframeDays
            );
            doc.image(bloodGlucoseChartImage, {
                width: 550,
                align: "center",
                valign: "center",
                x: (doc.page.width - 550) / 2
            }).moveDown(3);
        }

        doc.moveDown(100);

        if (nutritionData) {
            doc.addPage(); // optional new page if needed

            doc.fontSize(16)
                .text(`Nutrition (Last ${timeframeDays} days)`, { align: "center" })
                .moveDown();

            // We can show summary stats (goalAverage, actualAverage, etc.)
            const goalAvg = nutritionData.goalAverage?.toFixed(2) || "-";
            const actualAvg = nutritionData.actualAverage?.toFixed(2) || "-";

            // Find lowest consumption
            const allConsumed = nutritionData.logs.map(log => log.consumed);
            const lowestLog = allConsumed.length
                ? nutritionData.logs.reduce((min, log) => (log.consumed < min.consumed ? log : min))
                : null;
            const lowestConsumed = lowestLog ? lowestLog.consumed : "-";
            const lowestConsumedDate = lowestLog
                ? moment(lowestLog.createdAt).tz(TIMEZONE).format("DD MMM YYYY")
                : "-";

            doc.fontSize(12)
                .text(`Goal Average: ${goalAvg} ${nutritionData.unit}`, { align: "left" })
                .moveDown(0.5)
                .text(`Actual Average: ${actualAvg} ${nutritionData.unit}`, { align: "left" })
                .moveDown(0.5)
                .text(`Lowest Consumption: ${lowestConsumed} ${nutritionData.unit} on ${lowestConsumedDate}`, { align: "left" })
                .moveDown(1.5);

            // Generate & embed the nutrition chart
            const nutritionChartImage = await generateNutritionChart(nutritionData, timeframeDays);
            doc.image(nutritionChartImage, {
                width: 550,
                align: "center",
                valign: "center",
                x: (doc.page.width - 550) / 2
            }).moveDown(3);
        }

        doc.moveDown(100);

        if (hydrateData) {
            doc.addPage(); // optional if you want a fresh page

            doc.fontSize(16)
                .text(`Water Intake (Last ${timeframeDays} days)`, { align: "center" })
                .moveDown();

            // Summaries
            const goalAvg = hydrateData.goalAverage?.toFixed(2) || "-";
            const actualAvg = hydrateData.actualAverage?.toFixed(2) || "-";

            doc.fontSize(12)
                .text(`Goal Average: ${goalAvg} ${hydrateData.unit}`, { align: "left" })
                .moveDown(0.5)
                .text(`Actual Average: ${actualAvg} ${hydrateData.unit}`, { align: "left" })
                .moveDown(1);

            // Render stacked bar chart
            const hydrationStackedChart = await generateHydrationStackedChart(hydrateData, timeframeDays);
            doc.image(hydrationStackedChart, {
                width: 550,
                align: "center",
                valign: "center",
                x: (doc.page.width - 550) / 2
            }).moveDown(3);
        }


        // End & save PDF
        doc.end();
        stream.on("finish", () => {
            console.log("PDF generated successfully:", pdfPath);
        });
    } catch (error) {
        console.error("Error generating PDF:", error);
    }
}


const heartRateData = {
    "type": "heartrate",
    "value": 96,
    "benchMark": {
        "min": 83,
        "max": 140
    },
    "logs": [
        {
            "_id": "67ca661a15590866b5d367f1",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2heartrate7Mar2025",
                "name": "apple-hk"
            },
            "createdAt": 1741285800000,
            "goal": null,
            "lastmodifiedDate": 1741285800000,
            "measurementDate": 1741285800000,
            "type": "heartrate",
            "value": 96
        },
        {
            "_id": "67c7bf8915590866b5c021bb",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2heartrate5Mar2025"
            },
            "createdAt": 1741113000000,
            "goal": null,
            "lastmodifiedDate": 1741113000000,
            "measurementDate": 1741113000000,
            "type": "heartrate",
            "value": 87
        },
        {
            "_id": "67c5669f5fa6f57673cbbda5",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "1f5af6f4-b58d-41c2-9912-f40cb1a17728",
                "name": "restore-me"
            },
            "type": "heartrate",
            "measurementDate": 1740990060000,
            "lastmodifiedDate": 1740990060000,
            "value": 240,
            "createdAt": 1740990111759,
            "updatedAt": 1740990111759
        },
        {
            "_id": "67c559a713c06aa22289c062",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2heartrate3Mar2025",
                "name": "apple-hk"
            },
            "createdAt": 1740940200000,
            "goal": null,
            "lastmodifiedDate": 1740940200000,
            "measurementDate": 1740940200000,
            "type": "heartrate",
            "value": 83
        },
        {
            "_id": "67c41c5f7a9361056faf7de8",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "47c5689d-970b-4909-8b41-cb57f1a06470",
                "name": "restore-me"
            },
            "type": "heartrate",
            "measurementDate": 1740905520000,
            "lastmodifiedDate": 1740905520000,
            "value": 33,
            "createdAt": 1740905567614,
            "updatedAt": 1740905567614
        },
        {
            "_id": "67c170e5b4a0e5477676ed85",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2heartrate28Feb2025"
            },
            "createdAt": 1740681000000,
            "goal": null,
            "lastmodifiedDate": 1740681000000,
            "measurementDate": 1740681000000,
            "type": "heartrate",
            "value": 84
        },
        {
            "_id": "67c042265562fa7bbca10a4b",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "b18a9131-e25d-4176-a0d5-8b32b560332a",
                "name": "restore-me"
            },
            "type": "heartrate",
            "measurementDate": 1740653075000,
            "lastmodifiedDate": 1740653075000,
            "value": 110,
            "createdAt": 1740653094218,
            "updatedAt": 1740653094218
        },
        {
            "_id": "67bfd7a9b4a0e547765e2b90",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2heartrate27Feb2025"
            },
            "createdAt": 1740594600000,
            "goal": null,
            "lastmodifiedDate": 1740594600000,
            "measurementDate": 1740594600000,
            "type": "heartrate",
            "value": 85
        },
        {
            "_id": "67bf12035562fa7118a1097b",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "ffda52c5-690a-405d-a4d1-8c7ef245dfd8",
                "name": "restore-me"
            },
            "type": "heartrate",
            "measurementDate": 1740488828000,
            "lastmodifiedDate": 1740488828000,
            "value": 120,
            "createdAt": 1740575235546,
            "updatedAt": 1740575235546
        },
        {
            "_id": "67bc06bdc82c960e9c1b9013",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2heartrate24Feb2025",
                "name": "apple-hk"
            },
            "createdAt": 1740335400000,
            "goal": null,
            "lastmodifiedDate": 1740335400000,
            "measurementDate": 1740335400000,
            "type": "heartrate",
            "value": 76
        },
        {
            "_id": "67bc06bdc82c960e9c1b9012",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2heartrate22Feb2025"
            },
            "createdAt": 1740162600000,
            "goal": null,
            "lastmodifiedDate": 1740162600000,
            "measurementDate": 1740162600000,
            "type": "heartrate",
            "value": 105
        },
        {
            "_id": "67b7fe48c82c960e9c086801",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2heartrate21Feb2025",
                "name": "apple-hk"
            },
            "createdAt": 1740076200000,
            "goal": null,
            "lastmodifiedDate": 1740076200000,
            "measurementDate": 1740076200000,
            "type": "heartrate",
            "value": 78
        },
        {
            "_id": "67b5612336040ac59f944aee",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2heartrate19Feb2025",
                "name": "apple-hk"
            },
            "createdAt": 1739903400000,
            "goal": null,
            "lastmodifiedDate": 1739903400000,
            "measurementDate": 1739903400000,
            "type": "heartrate",
            "value": 84
        },
        {
            "_id": "67b8600fc82c960e9c10a2d9",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2heartrate17Feb2025",
                "name": "apple-hk"
            },
            "createdAt": 1739730600000,
            "goal": null,
            "lastmodifiedDate": 1739730600000,
            "measurementDate": 1739730600000,
            "type": "heartrate",
            "value": 78
        },
        {
            "_id": "67aee8ba49441e8a56951afb",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2heartrate14Feb2025"
            },
            "createdAt": 1739471400000,
            "goal": null,
            "lastmodifiedDate": 1739471400000,
            "measurementDate": 1739471400000,
            "type": "heartrate",
            "value": 84
        },
        {
            "_id": "67ac6f0d401febdd775f14f3",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "ea24a26f-b378-4c7f-9df3-0fa396343fe6",
                "name": "restore-me"
            },
            "type": "heartrate",
            "measurementDate": 1739353866000,
            "lastmodifiedDate": 1739353866000,
            "value": 33,
            "createdAt": 1739353869185,
            "updatedAt": 1739353869185
        },
        {
            "_id": "67ac260749441e8a567e9d1e",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2heartrate12Feb2025",
                "name": "apple-hk"
            },
            "createdAt": 1739298600000,
            "goal": null,
            "lastmodifiedDate": 1739298600000,
            "measurementDate": 1739298600000,
            "type": "heartrate",
            "value": 79
        },
        {
            "_id": "67a9720b49441e8a566914e6",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2heartrate10Feb2025"
            },
            "createdAt": 1739125800000,
            "goal": null,
            "lastmodifiedDate": 1739125800000,
            "measurementDate": 1739125800000,
            "type": "heartrate",
            "value": 75
        },
        {
            "_id": "67a5d32e49441e8a565c7e31",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2heartrate7Feb2025"
            },
            "createdAt": 1738866600000,
            "goal": null,
            "lastmodifiedDate": 1738866600000,
            "measurementDate": 1738866600000,
            "type": "heartrate",
            "value": 77
        },
        {
            "_id": "67b8600fc82c960e9c10a2d8",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2heartrate6Feb2025"
            },
            "createdAt": 1738780200000,
            "goal": null,
            "lastmodifiedDate": 1738780200000,
            "measurementDate": 1738780200000,
            "type": "heartrate",
            "value": 80
        },
        {
            "_id": "67a18e54003e6c423adb801a",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "e9e4eb43-53a5-49c8-b522-b7e9c64bfec5",
                "name": "restore-me"
            },
            "type": "heartrate",
            "measurementDate": 1738640973000,
            "lastmodifiedDate": 1738640973000,
            "value": 55,
            "createdAt": 1738640980579,
            "updatedAt": 1738640980579
        },
        {
            "_id": "67b8600fc82c960e9c10a2da",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2heartrate4Feb2025",
                "name": "apple-hk"
            },
            "createdAt": 1738607400000,
            "goal": null,
            "lastmodifiedDate": 1738607400000,
            "measurementDate": 1738607400000,
            "type": "heartrate",
            "value": 74
        },
        {
            "_id": "67b8600fc82c960e9c10a2d7",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2heartrate31Jan2025"
            },
            "createdAt": 1738261800000,
            "goal": null,
            "lastmodifiedDate": 1738261800000,
            "measurementDate": 1738261800000,
            "type": "heartrate",
            "value": 82
        },
        {
            "_id": "67b8600fc82c960e9c10a2d5",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2heartrate24Jan2025"
            },
            "createdAt": 1737657000000,
            "goal": null,
            "lastmodifiedDate": 1737657000000,
            "measurementDate": 1737657000000,
            "type": "heartrate",
            "value": 90
        },
        {
            "_id": "677d0e6d672728813342d54f",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "e2154391-16c4-4f62-88fc-51c230875e58",
                "name": "restore-me"
            },
            "type": "heartrate",
            "measurementDate": 1736248920000,
            "lastmodifiedDate": 1736248920000,
            "value": 55,
            "createdAt": 1736248941980,
            "updatedAt": 1736248941980
        },
        {
            "_id": "677c0ffec1d5c0c68ed4e4d9",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "36766251-3e8b-41a2-9cda-d2dc47df7098",
                "name": "restore-me"
            },
            "type": "heartrate",
            "measurementDate": 1736183803000,
            "lastmodifiedDate": 1736183803000,
            "value": 22,
            "createdAt": 1736183806704,
            "updatedAt": 1736183806704
        },
        {
            "_id": "6776821c72d5f2277f1bf181",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "263144ab-0446-4066-8a64-20250ecfac9a",
                "name": "restore-me"
            },
            "type": "heartrate",
            "measurementDate": 1735819800000,
            "lastmodifiedDate": 1735819800000,
            "value": 66,
            "createdAt": 1735819804742,
            "updatedAt": 1735819804742
        },
        {
            "_id": "676ab9eece0889321acfe68f",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6d85c172-a264-4016-903f-987db38201cc",
                "name": "restore-me"
            },
            "type": "heartrate",
            "measurementDate": 1735047659000,
            "lastmodifiedDate": 1735047659000,
            "value": 20,
            "createdAt": 1735047662718,
            "updatedAt": 1735047662718
        },
        {
            "_id": "67686564dddddcf3a32673e7",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "51c9cccc-6c61-4334-a378-0d54b3e50f4b",
                "name": "restore-me"
            },
            "type": "heartrate",
            "measurementDate": 1734892200000,
            "lastmodifiedDate": 1734892200000,
            "value": 11,
            "createdAt": 1734894948059,
            "updatedAt": 1734894948059
        },
        {
            "_id": "67686554dddddc4c7c2673e6",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "9db01b52-dfe3-45dd-ae17-bd65b19b1f72",
                "name": "restore-me"
            },
            "type": "heartrate",
            "measurementDate": 1734891900000,
            "lastmodifiedDate": 1734891900000,
            "value": 33,
            "createdAt": 1734894932070,
            "updatedAt": 1734894932070
        },
        {
            "_id": "676861ecb81d91b49cc95e3b",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "71817d87-7cd4-479b-9d06-702a6a1d47bb",
                "name": "restore-me"
            },
            "type": "heartrate",
            "measurementDate": 1734872400000,
            "lastmodifiedDate": 1734872400000,
            "value": 50,
            "createdAt": 1734894060158,
            "updatedAt": 1734894060158
        },
        {
            "_id": "676799554a7c2a52a1e49505",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "d4c1583e-5a1e-47f6-b683-9a954082f5fc",
                "name": "restore-me"
            },
            "type": "heartrate",
            "measurementDate": 1734805800000,
            "lastmodifiedDate": 1734805800000,
            "value": 99,
            "createdAt": 1734842709243,
            "updatedAt": 1734842709243
        },
        {
            "_id": "676799394a7c2a00d1e49504",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "b1bc6270-1ef1-4eab-9955-617a34f7a325",
                "name": "restore-me"
            },
            "type": "heartrate",
            "measurementDate": 1734805740000,
            "lastmodifiedDate": 1734805740000,
            "value": 698,
            "createdAt": 1734842681071,
            "updatedAt": 1734842681071
        }
    ]
}

const temperatureData = {
    "type": "temperature",
    "value": 98,
    "benchMark": {
        "baseline": 98.6,
        "normalRange": {
            "min": 97.4,
            "max": 99.6
        }
    },
    "logs": [
        {
            "_id": "67c997c915590866b5d08f27",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2806E9349-03F8-44BE-A5B1-C72E84269ACF",
                "name": "apple-hk"
            },
            "createdAt": 1741263900000,
            "goal": null,
            "lastmodifiedDate": 1741263900000,
            "measurementDate": 1741263900000,
            "type": "temperature",
            "value": 98
        },
        {
            "_id": "67c7bf8915590866b5c021be",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2A40F3D5F-ED96-437E-8AFB-65E942430802",
                "name": "apple-hk"
            },
            "createdAt": 1740723000000,
            "goal": null,
            "lastmodifiedDate": 1740723000000,
            "measurementDate": 1740723000000,
            "type": "temperature",
            "value": 99
        },
        {
            "_id": "67bf12b55562faad95a10998",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "fa545f20-3038-4ba8-a268-73d4fe0e7f57",
                "name": "restore-me"
            },
            "type": "temperature",
            "measurementDate": 1740575407000,
            "lastmodifiedDate": 1740575407000,
            "value": 97,
            "createdAt": 1740575413133,
            "updatedAt": 1740575413133
        },
        {
            "_id": "67bf12ca5562fa1a36a10999",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "ee092ec2-7d50-4c51-8858-692e06de7fed",
                "name": "restore-me"
            },
            "type": "temperature",
            "measurementDate": 1740402620000,
            "lastmodifiedDate": 1740402620000,
            "value": 66.9,
            "createdAt": 1740575434530,
            "updatedAt": 1740575434530
        },
        {
            "_id": "67bf12955562fa55e5a10996",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "54002921-0092-4d71-9390-d4c73819b5a7",
                "name": "restore-me"
            },
            "type": "temperature",
            "measurementDate": 1740402574000,
            "lastmodifiedDate": 1740402574000,
            "value": 96,
            "createdAt": 1740575381499,
            "updatedAt": 1740575381499
        },
        {
            "_id": "67bf12a05562fab989a10997",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "8c81b859-bf7f-4e40-bb23-1e732cd0d482",
                "name": "restore-me"
            },
            "type": "temperature",
            "measurementDate": 1740229785000,
            "lastmodifiedDate": 1740229785000,
            "value": 80,
            "createdAt": 1740575392600,
            "updatedAt": 1740575392600
        },
        {
            "_id": "67bf128c5562fa98b5a10995",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "7512721f-3c34-4420-a7ae-13c61dd1ee6a",
                "name": "restore-me"
            },
            "type": "temperature",
            "measurementDate": 1740143365000,
            "lastmodifiedDate": 1740143365000,
            "value": 98,
            "createdAt": 1740575372365,
            "updatedAt": 1740575372365
        },
        {
            "_id": "67bf12835562faf002a10994",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "645654d1-df0f-4913-949f-2c74c650b93c",
                "name": "restore-me"
            },
            "type": "temperature",
            "measurementDate": 1740056953000,
            "lastmodifiedDate": 1740056953000,
            "value": 66,
            "createdAt": 1740575363867,
            "updatedAt": 1740575363867
        },
        {
            "_id": "67b6bc97fbbb52763d23ac60",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "ef138bd0-978c-4b7a-9180-2586bc0b2a07",
                "name": "restore-me"
            },
            "type": "temperature",
            "measurementDate": 1740029073000,
            "lastmodifiedDate": 1740029073000,
            "value": 100,
            "createdAt": 1740029079215,
            "updatedAt": 1740029079215
        },
        {
            "_id": "67bf070db4a0e54776557b60",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe23fe26d7c-7545-49cc-90cb-c00f059f00a7",
                "name": "google-hc"
            },
            "createdAt": 1739945220000,
            "goal": null,
            "lastmodifiedDate": 1739945229801,
            "measurementDate": 1739945220000,
            "type": "temperature",
            "value": 98.00000228881837
        },
        {
            "_id": "67b43389401feb59015f16d6",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "b04fbc62-ea71-49c8-bcc6-857c4549c98b",
                "name": "restore-me"
            },
            "type": "temperature",
            "measurementDate": 1739862914000,
            "lastmodifiedDate": 1739862914000,
            "value": 98.6,
            "createdAt": 1739862921068,
            "updatedAt": 1739862921068
        },
        {
            "_id": "67b30f07401feba4525f1670",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "326b110b-5b53-418d-884c-e3d1beb7cfe9",
                "name": "restore-me"
            },
            "type": "temperature",
            "measurementDate": 1739788020000,
            "lastmodifiedDate": 1739788020000,
            "value": 70,
            "createdAt": 1739788039595,
            "updatedAt": 1739788039595
        },
        {
            "_id": "67ad84bd401feb53285f14fe",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "d7cb9e0f-6cf1-4773-8f7d-36ed10cedb24",
                "name": "restore-me"
            },
            "type": "temperature",
            "measurementDate": 1739424900000,
            "lastmodifiedDate": 1739424900000,
            "value": 33,
            "createdAt": 1739424957491,
            "updatedAt": 1739424957491
        },
        {
            "_id": "678475458af755791c5f4901",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "f1f74b4f-f304-4479-85ef-43e303c0b5ac",
                "name": "restore-me"
            },
            "type": "temperature",
            "measurementDate": 1736733960000,
            "lastmodifiedDate": 1736733960000,
            "value": 75,
            "createdAt": 1736734021471,
            "updatedAt": 1736734021471
        },
        {
            "_id": "677cc780c1d5c026b9d4e4eb",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "38cb612c-beef-44f1-b00a-405cab119132",
                "name": "restore-me"
            },
            "type": "temperature",
            "measurementDate": 1736230776000,
            "lastmodifiedDate": 1736230776000,
            "value": 100,
            "createdAt": 1736230784616,
            "updatedAt": 1736230784616
        },
        {
            "_id": "677c1a1cc1d5c05c57d4e4dc",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "95b4758a-787f-4265-8173-e30e3b5e8c55",
                "name": "restore-me"
            },
            "type": "temperature",
            "measurementDate": 1736186393000,
            "lastmodifiedDate": 1736186393000,
            "value": 333,
            "createdAt": 1736186396924,
            "updatedAt": 1736186396924
        },
        {
            "_id": "6769a2277e8b556dc8343a5a",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6e6ff080-4661-4aa2-8846-e71d072fed5a",
                "name": "restore-me"
            },
            "type": "temperature",
            "measurementDate": 1734976020000,
            "lastmodifiedDate": 1734976020000,
            "value": 33,
            "createdAt": 1734976039993,
            "updatedAt": 1734976039993
        },
        {
            "_id": "67679deee0ac8d4c5a2ca6a9",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "5a926b8c-ad8b-468e-83a2-bf396c0c9aab",
                "name": "restore-me"
            },
            "type": "temperature",
            "measurementDate": 1734843840000,
            "lastmodifiedDate": 1734843840000,
            "value": 66,
            "createdAt": 1734843886152,
            "updatedAt": 1734843886152
        },
        {
            "_id": "67679ddce0ac8d0fdb2ca6a8",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "b749af69-714c-4621-807f-a983c99c28c1",
                "name": "restore-me"
            },
            "type": "temperature",
            "measurementDate": 1734805680000,
            "lastmodifiedDate": 1734805680000,
            "value": 92,
            "createdAt": 1734843868564,
            "updatedAt": 1734843868564
        },
        {
            "_id": "675fab1fd3f53f058ed05f68",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "1368b60a-b86e-4967-9d00-b23bd046457e",
                "name": "restore-me"
            },
            "type": "temperature",
            "measurementDate": 1734322969000,
            "lastmodifiedDate": 1734322969000,
            "value": 66,
            "createdAt": 1734322975272,
            "updatedAt": 1734322975272
        }
    ]
}

const bloodPressureData = {
    "type": "bloodpressure",
    "systolic": 150,
    "diastolic": 95,
    "benchMark": {
        "systolic": {
            "lowBorderline": {
                "min": 70,
                "max": 89
            },
            "normal": {
                "min": 90,
                "max": 120
            },
            "highBorderline": {
                "min": 121,
                "max": 140
            },
            "high": {
                "min": 141,
                "max": 190
            }
        },
        "diastolic": {
            "lowBorderline": {
                "min": 40,
                "max": 59
            },
            "normal": {
                "min": 60,
                "max": 80
            },
            "highBorderline": {
                "min": 81,
                "max": 90
            },
            "high": {
                "min": 91,
                "max": 100
            }
        }
    },
    "logs": [
        {
            "_id": "67ca986015590866b5d54a5e",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2cf0dde85-b3dd-4075-9789-8d5b5278a16c",
                "name": "google-hc"
            },
            "createdAt": 1741330440000,
            "diastolic": 95,
            "lastmodifiedDate": 1741330460300,
            "measurementDate": 1741330440000,
            "systolic": 150,
            "type": "bloodpressure"
        },
        {
            "_id": "67ca972f15590866b5d541a9",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe287bba601-8070-479c-940d-30b484cb2313",
                "name": "google-hc"
            },
            "createdAt": 1741330080000,
            "diastolic": 95,
            "lastmodifiedDate": 1741330094943,
            "measurementDate": 1741330080000,
            "systolic": 140,
            "type": "bloodpressure"
        },
        {
            "_id": "67c9a51015590866b5d0c77d",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2981096b3-f64e-47cd-bbf4-f69736d0513c",
                "name": "google-hc"
            },
            "createdAt": 1741267860000,
            "diastolic": 95,
            "lastmodifiedDate": 1741268192686,
            "measurementDate": 1741267860000,
            "systolic": 135,
            "type": "bloodpressure"
        },
        {
            "_id": "67c430597a9361d33daf7dec",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "bb053025-ae06-48de-8819-6d935cfd64bd",
                "name": "restore-me"
            },
            "type": "bloodpressure",
            "measurementDate": 1740910620000,
            "lastmodifiedDate": 1740910620000,
            "systolic": 120,
            "diastolic": 40,
            "createdAt": 1740910681264,
            "updatedAt": 1740910681264
        },
        {
            "_id": "67c198cbd804fa09086006a4",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "e7fdc92b-394e-428a-8a90-336c603a29b2",
                "name": "restore-me"
            },
            "type": "bloodpressure",
            "measurementDate": 1740740760000,
            "lastmodifiedDate": 1740740760000,
            "systolic": 120,
            "diastolic": 80,
            "createdAt": 1740740811525,
            "updatedAt": 1740740811525
        },
        {
            "_id": "67bf070db4a0e54776557b5c",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe246316567-c32d-4a10-88a7-510fd6b16ebc",
                "name": "google-hc"
            },
            "createdAt": 1739954700000,
            "diastolic": 95,
            "lastmodifiedDate": 1739954727632,
            "measurementDate": 1739954700000,
            "systolic": 135,
            "type": "bloodpressure"
        },
        {
            "_id": "67bf070db4a0e54776557b5b",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe29d18a696-d962-40a1-86b0-78777085ed1b",
                "name": "google-hc"
            },
            "createdAt": 1739953920000,
            "diastolic": 94,
            "lastmodifiedDate": 1739953973390,
            "measurementDate": 1739953920000,
            "systolic": 134,
            "type": "bloodpressure"
        },
        {
            "_id": "67bf070db4a0e54776557b5a",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe268328ea7-ddd6-4c11-b83a-cd4eb4d593ce",
                "name": "google-hc"
            },
            "createdAt": 1739948460000,
            "diastolic": 93,
            "lastmodifiedDate": 1739948485727,
            "measurementDate": 1739948460000,
            "systolic": 133,
            "type": "bloodpressure"
        },
        {
            "_id": "67bf070db4a0e54776557b59",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2dba4c2fa-bad7-47be-a935-b1f3ba80dbc7",
                "name": "google-hc"
            },
            "createdAt": 1739948340000,
            "diastolic": 92,
            "lastmodifiedDate": 1739948370936,
            "measurementDate": 1739948340000,
            "systolic": 132,
            "type": "bloodpressure"
        },
        {
            "_id": "67bf070db4a0e54776557b57",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe250d7429b-d458-4ab0-b843-be168f1cb17b",
                "name": "google-hc"
            },
            "createdAt": 1739947800000,
            "diastolic": 91,
            "lastmodifiedDate": 1739948081722,
            "measurementDate": 1739947800000,
            "systolic": 131,
            "type": "bloodpressure"
        },
        {
            "_id": "67b571fe36040ac59f95bad6",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe23b4f4806-dd8a-42c2-87aa-539c3ac20ede",
                "name": "google-hc"
            },
            "createdAt": 1739944380000,
            "diastolic": 90,
            "lastmodifiedDate": 1739944416407,
            "measurementDate": 1739944380000,
            "systolic": 130,
            "type": "bloodpressure"
        },
        {
            "_id": "67b5708d36040ac59f957836",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe21e93fadd-7c63-4212-a201-e0f3ca90f317",
                "name": "google-hc"
            },
            "createdAt": 1739942700000,
            "diastolic": 80,
            "lastmodifiedDate": 1739943221284,
            "measurementDate": 1739942700000,
            "systolic": 120,
            "type": "bloodpressure"
        },
        {
            "_id": "67b30f2b401feb3cf65f1672",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "fbaea7e7-d925-47d0-9247-7f3d978d8adb",
                "name": "restore-me"
            },
            "type": "bloodpressure",
            "measurementDate": 1739788020000,
            "lastmodifiedDate": 1739788020000,
            "systolic": 100,
            "diastolic": 80,
            "createdAt": 1739788075407,
            "updatedAt": 1739788075407
        },
        {
            "_id": "67aed0a2401feb16895f1509",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "5959b9b7-4a0c-46c4-97f3-028369f0442a",
                "name": "restore-me"
            },
            "type": "bloodpressure",
            "measurementDate": 1739509911000,
            "lastmodifiedDate": 1739509911000,
            "systolic": 11,
            "diastolic": 22,
            "createdAt": 1739509922724,
            "updatedAt": 1739509922724
        },
        {
            "_id": "67a9dbed31d90d01d8d4095b",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "f4bbadc7-0899-4fe4-abeb-1a6dc105121a",
                "name": "restore-me"
            },
            "type": "bloodpressure",
            "measurementDate": 1739185129000,
            "lastmodifiedDate": 1739185129000,
            "systolic": 11,
            "diastolic": 22,
            "createdAt": 1739185133659,
            "updatedAt": 1739185133660
        },
        {
            "_id": "677cc8b3c1d5c0b780d4e4ec",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "14d2e3a2-f689-4661-84ac-3691c617fd01",
                "name": "restore-me"
            },
            "type": "bloodpressure",
            "measurementDate": 1736231079000,
            "lastmodifiedDate": 1736231079000,
            "systolic": 120,
            "diastolic": 80,
            "createdAt": 1736231091956,
            "updatedAt": 1736231091956
        },
        {
            "_id": "677c194ac1d5c01eb9d4e4db",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "73729d13-aed3-4016-b10c-b0488ebcb4e0",
                "name": "restore-me"
            },
            "type": "bloodpressure",
            "measurementDate": 1736186179000,
            "lastmodifiedDate": 1736186179000,
            "systolic": 11,
            "diastolic": 22,
            "createdAt": 1736186186832,
            "updatedAt": 1736186186832
        },
        {
            "_id": "6776823472d5f2a0f51bf182",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "bbc26a60-171b-4bea-b56a-e35fe6efc2d6",
                "name": "restore-me"
            },
            "type": "bloodpressure",
            "measurementDate": 1735819822000,
            "lastmodifiedDate": 1735819822000,
            "systolic": 88,
            "diastolic": 99,
            "createdAt": 1735819828345,
            "updatedAt": 1735819828345
        },
        {
            "_id": "6776821472d5f220cb1bf180",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "733e73bb-5153-4711-8b55-9bbd8e64a2af",
                "name": "restore-me"
            },
            "type": "bloodpressure",
            "measurementDate": 1735819787000,
            "lastmodifiedDate": 1735819787000,
            "systolic": 66,
            "diastolic": 88,
            "createdAt": 1735819796011,
            "updatedAt": 1735819796011
        },
        {
            "_id": "6769a1c37e8b554919343a59",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "41396cde-ac94-4dba-80c7-e599c5b19f57",
                "name": "restore-me"
            },
            "type": "bloodpressure",
            "measurementDate": 1734975900000,
            "lastmodifiedDate": 1734975900000,
            "systolic": 22,
            "diastolic": 11,
            "createdAt": 1734975939127,
            "updatedAt": 1734975939127
        },
        {
            "_id": "6769a1677e8b55e0e9343a58",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "278bb410-9f79-46f4-86ce-4a0997177b9e",
                "name": "restore-me"
            },
            "type": "bloodpressure",
            "measurementDate": 1734975841000,
            "lastmodifiedDate": 1734975841000,
            "systolic": 88,
            "diastolic": 44,
            "createdAt": 1734975847640,
            "updatedAt": 1734975847640
        },
        {
            "_id": "676861b9b81d915380c95e3a",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "573894c8-de7b-4bab-8237-322dd3fe7fb7",
                "name": "restore-me"
            },
            "type": "bloodpressure",
            "measurementDate": 1734890340000,
            "lastmodifiedDate": 1734890340000,
            "systolic": 99,
            "diastolic": 33,
            "createdAt": 1734894009031,
            "updatedAt": 1734894009031
        },
        {
            "_id": "67685d7ce0ac8d6f4a2ca738",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "697b90d8-e811-40ab-b613-5b64f293d766",
                "name": "restore-me"
            },
            "type": "bloodpressure",
            "measurementDate": 1734806460000,
            "lastmodifiedDate": 1734806460000,
            "systolic": 66,
            "diastolic": 33,
            "createdAt": 1734892924712,
            "updatedAt": 1734892924712
        },
        {
            "_id": "675fab01d3f53f11aad05f66",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "8a802dd3-5cf2-4e59-b6dc-2655b2a414ec",
                "name": "restore-me"
            },
            "type": "bloodpressure",
            "measurementDate": 1734322939000,
            "lastmodifiedDate": 1734322939000,
            "systolic": 60,
            "diastolic": 40,
            "createdAt": 1734322945831,
            "updatedAt": 1734322945831
        }
    ]
}

const bloodGlucoseData = {
    "type": "bloodglucose",
    "value": 900,
    "category": "RANDOM",
    "benchMark": {
        "beforeMeals": {
            "outlier": {
                "min": 0,
                "max": 69
            },
            "lowBorderline": {
                "min": 70,
                "max": 89
            },
            "normal": {
                "min": 90,
                "max": 99
            },
            "highBorderline": {
                "min": 100,
                "max": 125
            },
            "high": {
                "min": 126,
                "max": 1000
            }
        },
        "afterMealsAndRandom": {
            "outlier": {
                "min": 0,
                "max": 69
            },
            "lowBorderline": {
                "min": 70,
                "max": 100
            },
            "normal": {
                "min": 101,
                "max": 140
            },
            "highBorderline": {
                "min": 141,
                "max": 199
            },
            "high": {
                "min": 200,
                "max": 1000
            }
        }
    },
    "logs": [
        {
            "_id": "675fab29d3f53f0529d05f69",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "f7370eb1-e694-48c7-953a-4b6204df9776",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1734322980000,
            "lastmodifiedDate": 1734322980000,
            "value": 666,
            "category": "RANDOM",
            "createdAt": 1734322985256,
            "updatedAt": 1734322985256
        },
        {
            "_id": "67685081e0ac8d82842ca72e",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "4f649ce3-32ec-4031-8ec2-922c236da35a",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1734889560000,
            "lastmodifiedDate": 1734889560000,
            "value": 67,
            "category": "FASTING",
            "createdAt": 1734889601619,
            "updatedAt": 1734889601619
        },
        {
            "_id": "6769a3757e8b55fa6a343a5b",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "1e15fb0e-f63d-4ad5-811f-3cda6e9056f5",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1734976320000,
            "lastmodifiedDate": 1734976320000,
            "value": 663,
            "category": "RANDOM",
            "createdAt": 1734976373749,
            "updatedAt": 1734976373749
        },
        {
            "_id": "677aae96c1d5c00745d4e48e",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "1df155f6-5c3d-410b-821a-7fbfb8e1a195",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1736093280000,
            "lastmodifiedDate": 1736093280000,
            "value": 66,
            "category": "FASTING",
            "createdAt": 1736093334433,
            "updatedAt": 1736093334433
        },
        {
            "_id": "677c16d4c1d5c036afd4e4da",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "eaec24b1-189c-45da-b2b3-e73715b0706c",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1736185500000,
            "lastmodifiedDate": 1736185500000,
            "value": 32,
            "category": "RANDOM",
            "createdAt": 1736185556244,
            "updatedAt": 1736185556244
        },
        {
            "_id": "677d0cf46727284ec242d54e",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "a83628e0-f631-4e7e-85f8-eb50a619178b",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1736248560000,
            "lastmodifiedDate": 1736248560000,
            "value": 66,
            "category": "RANDOM",
            "createdAt": 1736248564883,
            "updatedAt": 1736248564883
        },
        {
            "_id": "6793781b1a744dc82fe4bee0",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6961386c-7c99-4f28-b4ff-5b62dcfcd5cc",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1737544980000,
            "lastmodifiedDate": 1737544980000,
            "value": 58,
            "category": "RANDOM",
            "createdAt": 1737717787789,
            "updatedAt": 1737717787789
        },
        {
            "_id": "67937c801a744d0fc2e4beeb",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "5fc758e9-a3a2-48a0-b7ec-9cf66be9d0a0",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1737632460000,
            "lastmodifiedDate": 1737632460000,
            "value": 120,
            "category": "AFTER_A_MEAL",
            "createdAt": 1737718912156,
            "updatedAt": 1737718912156
        },
        {
            "_id": "679378031a744d4042e4bede",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "4555fd6c-8105-4442-899f-519fbcc2252c",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1737717720000,
            "lastmodifiedDate": 1737717720000,
            "value": 222,
            "category": "RANDOM",
            "createdAt": 1737717763737,
            "updatedAt": 1737717763737
        },
        {
            "_id": "6793780c1a744d4a97e4bedf",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "a2c7dc95-bc12-40b8-8e11-ee55cca1c3c0",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1737717720000,
            "lastmodifiedDate": 1737717720000,
            "value": 333,
            "category": "RANDOM",
            "createdAt": 1737717772220,
            "updatedAt": 1737717772220
        },
        {
            "_id": "6793792c1a744dcea9e4bee1",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "4fd63683-5f5d-46f5-9b5c-6cc52e3e1ea0",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1737718020000,
            "lastmodifiedDate": 1737718020000,
            "value": 100,
            "category": "FASTING",
            "createdAt": 1737718060910,
            "updatedAt": 1737718060910
        },
        {
            "_id": "6793793a1a744da328e4bee2",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "18f82ae5-bfbd-4123-8c48-74bb4db5e0b0",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1737718020000,
            "lastmodifiedDate": 1737718020000,
            "value": 150,
            "category": "FASTING",
            "createdAt": 1737718074654,
            "updatedAt": 1737718074654
        },
        {
            "_id": "679379461a744d174de4bee3",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "c013b884-5933-4e4e-9468-b91403102cce",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1737718080000,
            "lastmodifiedDate": 1737718080000,
            "value": 100,
            "category": "FASTING",
            "createdAt": 1737718086337,
            "updatedAt": 1737718086337
        },
        {
            "_id": "679379511a744d3620e4bee4",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "d63f4ee4-9050-4876-8d24-701ba1e0204a",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1737718080000,
            "lastmodifiedDate": 1737718080000,
            "value": 80,
            "category": "FASTING",
            "createdAt": 1737718097554,
            "updatedAt": 1737718097554
        },
        {
            "_id": "6793797d1a744d8feee4bee5",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "614b7835-6fd4-4872-a662-a0c8ed1485a0",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1737718080000,
            "lastmodifiedDate": 1737718080000,
            "value": 100,
            "category": "AFTER_A_MEAL",
            "createdAt": 1737718141112,
            "updatedAt": 1737718141112
        },
        {
            "_id": "67937c701a744d4255e4beea",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "e508341a-4f10-4631-a98f-37de63ffa727",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1737718860000,
            "lastmodifiedDate": 1737718860000,
            "value": 100,
            "category": "AFTER_A_MEAL",
            "createdAt": 1737718896778,
            "updatedAt": 1737718896778
        },
        {
            "_id": "67a5e3f531d90d2c61d408d6",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "7dcc3136-9efa-41d5-8d61-2fa2182fda91",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1738925040000,
            "lastmodifiedDate": 1738925040000,
            "value": 10,
            "category": "RANDOM",
            "createdAt": 1738925045975,
            "updatedAt": 1738925045975
        },
        {
            "_id": "67a5e3fe31d90da5c9d408d7",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "ed3efec6-8cf0-45cb-a390-f4fcc866340b",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1738925040000,
            "lastmodifiedDate": 1738925040000,
            "value": 100,
            "category": "RANDOM",
            "createdAt": 1738925054362,
            "updatedAt": 1738925054362
        },
        {
            "_id": "67a5e40931d90d673dd408d8",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "a85b6330-2578-4825-83d0-61dbaf1793c9",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1738925040000,
            "lastmodifiedDate": 1738925040000,
            "value": 140,
            "category": "RANDOM",
            "createdAt": 1738925065526,
            "updatedAt": 1738925065526
        },
        {
            "_id": "67a5e41831d90d1247d408d9",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "d5a01ca9-ed6d-4f7d-87d4-a6d966fbcb13",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1738925040000,
            "lastmodifiedDate": 1738925040000,
            "value": 150,
            "category": "RANDOM",
            "createdAt": 1738925080077,
            "updatedAt": 1738925080077
        },
        {
            "_id": "67a5e42b31d90d211ed408da",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "e3178909-6ab6-4947-af7f-b87d8ca2ddf6",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1738925040000,
            "lastmodifiedDate": 1738925040000,
            "value": 40,
            "category": "RANDOM",
            "createdAt": 1738925099513,
            "updatedAt": 1738925099513
        },
        {
            "_id": "67a5e43131d90d4f14d408db",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "ba285232-5bbb-4327-a947-db37111f4aa6",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1738925100000,
            "lastmodifiedDate": 1738925100000,
            "value": 50,
            "category": "RANDOM",
            "createdAt": 1738925105358,
            "updatedAt": 1738925105358
        },
        {
            "_id": "67a5e43931d90d6b87d408dc",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6a760728-7580-4bce-a961-403644fd5865",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1738925100000,
            "lastmodifiedDate": 1738925100000,
            "value": 60,
            "category": "RANDOM",
            "createdAt": 1738925113395,
            "updatedAt": 1738925113395
        },
        {
            "_id": "67a5e45431d90d7f52d408dd",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "b24c0116-23eb-4bb2-bb80-04e3043561de",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1738925100000,
            "lastmodifiedDate": 1738925100000,
            "value": 60,
            "category": "RANDOM",
            "createdAt": 1738925140652,
            "updatedAt": 1738925140652
        },
        {
            "_id": "67a5e45a31d90d2d72d408de",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "da840efc-9cae-4d8f-a25d-e06c8cf89062",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1738925100000,
            "lastmodifiedDate": 1738925100000,
            "value": 70,
            "category": "RANDOM",
            "createdAt": 1738925146398,
            "updatedAt": 1738925146398
        },
        {
            "_id": "67a5e46331d90dcbb4d408df",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6aadb2f8-b13c-4a9b-bb73-4c21ea4a1a44",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1738925100000,
            "lastmodifiedDate": 1738925100000,
            "value": 99,
            "category": "RANDOM",
            "createdAt": 1738925155755,
            "updatedAt": 1738925155755
        },
        {
            "_id": "67a5e46a31d90db05dd408e0",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "fd6bda2b-322d-427e-be35-974a210894bf",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1738925160000,
            "lastmodifiedDate": 1738925160000,
            "value": 100,
            "category": "RANDOM",
            "createdAt": 1738925162449,
            "updatedAt": 1738925162449
        },
        {
            "_id": "67a5e47031d90dc8aed408e1",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "38d75be7-4eb0-4dfd-b0ad-5c510e07e61c",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1738925160000,
            "lastmodifiedDate": 1738925160000,
            "value": 110,
            "category": "RANDOM",
            "createdAt": 1738925168601,
            "updatedAt": 1738925168601
        },
        {
            "_id": "67a5e47631d90d2148d408e2",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "4125a02c-b9df-4aa5-8194-dccbe65934cf",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1738925160000,
            "lastmodifiedDate": 1738925160000,
            "value": 109,
            "category": "RANDOM",
            "createdAt": 1738925174657,
            "updatedAt": 1738925174657
        },
        {
            "_id": "67a9cf8c31d90d0099d40951",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "7f7ba4d9-4aef-40a1-9042-45f7f391c52c",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1739181960000,
            "lastmodifiedDate": 1739181960000,
            "value": 0,
            "category": "RANDOM",
            "createdAt": 1739181964967,
            "updatedAt": 1739181964967
        },
        {
            "_id": "67a9d08431d90d46b4d40959",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "d9fd6ccd-b362-43de-a023-064f802464f8",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1739182200000,
            "lastmodifiedDate": 1739182200000,
            "value": 22,
            "category": "RANDOM",
            "createdAt": 1739182212601,
            "updatedAt": 1739182212601
        },
        {
            "_id": "67ad8095401feb1a965f14f9",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "c55dcb17-a164-42cc-ac29-ebfdc75c8044",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1739423880000,
            "lastmodifiedDate": 1739423880000,
            "value": 226,
            "category": "FASTING",
            "createdAt": 1739423893270,
            "updatedAt": 1739423893270
        },
        {
            "_id": "67aed038401feb9c645f1508",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "5c6200b2-3056-408f-bd7b-2fb82d2a8075",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1739509800000,
            "lastmodifiedDate": 1739509800000,
            "value": 111,
            "category": "AFTER_A_MEAL",
            "createdAt": 1739509816877,
            "updatedAt": 1739509816877
        },
        {
            "_id": "67b30f17401feb3ee05f1671",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "765a2047-09ad-49a2-a879-b75c02a884d7",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1739788020000,
            "lastmodifiedDate": 1739788020000,
            "value": 100,
            "category": "FASTING",
            "createdAt": 1739788055720,
            "updatedAt": 1739788055720
        },
        {
            "_id": "67b55a0dfbf9421c279ea568",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "909fa078-9d73-4633-922d-7ffdc46516b0",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1739938260000,
            "lastmodifiedDate": 1739938260000,
            "value": 150,
            "category": "AFTER_A_MEAL",
            "createdAt": 1739938317879,
            "updatedAt": 1739938317879
        },
        {
            "_id": "67b55ea6fbf94259559ea56e",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "e1e0e1c5-be8a-4d9c-92d7-ec37bd3b6583",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1739939460000,
            "lastmodifiedDate": 1739939460000,
            "value": 222,
            "category": "RANDOM",
            "createdAt": 1739939494859,
            "updatedAt": 1739939494859
        },
        {
            "_id": "67b56177fbf942087b9ea573",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "355cbdb7-b429-4b26-a70f-a18f51d9f341",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1739940180000,
            "lastmodifiedDate": 1739940180000,
            "value": 229,
            "category": "AFTER_A_MEAL",
            "createdAt": 1739940215776,
            "updatedAt": 1739940215776
        },
        {
            "_id": "67b5618bfbf94212e69ea574",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "8ffb041f-8ad2-4331-9ab6-169fe18694d5",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1739940180000,
            "lastmodifiedDate": 1739940180000,
            "value": 112,
            "category": "FASTING",
            "createdAt": 1739940235520,
            "updatedAt": 1739940235520
        },
        {
            "_id": "67b561aafbf942d0659ea575",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "a0bd5a8a-dd61-45c4-8ae3-cff6328f0531",
                "name": "restore-me"
            },
            "type": "bloodglucose",
            "measurementDate": 1739940240000,
            "lastmodifiedDate": 1739940240000,
            "value": 100,
            "category": "FASTING",
            "createdAt": 1739940266387,
            "updatedAt": 1739940266387
        },
        {
            "_id": "67b588e236040ac59f99497f",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe21162B7E0-577E-4EA6-AD3D-BF05E31BE6D3"
            },
            "category": "FASTING",
            "createdAt": 1739950260000,
            "lastmodifiedDate": 1739950260000,
            "measurementDate": 1739950260000,
            "type": "bloodglucose",
            "value": 100
        },
        {
            "_id": "67b597f936040ac59f9982e4",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2DF5257A2-A66B-4083-8901-2A9AA429B5D9"
            },
            "category": "AFTER_A_MEAL",
            "createdAt": 1739954040000,
            "lastmodifiedDate": 1739954040000,
            "measurementDate": 1739954040000,
            "type": "bloodglucose",
            "value": 64
        },
        {
            "_id": "67b597f936040ac59f9982e3",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe28A67C7EF-0992-48BB-81A7-AF9878541FB0",
                "name": "apple-hk"
            },
            "category": "AFTER_A_MEAL",
            "createdAt": 1739954100000,
            "lastmodifiedDate": 1739954100000,
            "measurementDate": 1739954100000,
            "type": "bloodglucose",
            "value": 22
        },
        {
            "_id": "67bf070db4a0e54776557b63",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2a7815e75-ba68-4351-b2f6-dc0d3516cd68",
                "name": "google-hc"
            },
            "category": "RANDOM",
            "createdAt": 1739955360000,
            "lastmodifiedDate": 1739955376197,
            "measurementDate": 1739955360000,
            "type": "bloodglucose",
            "value": 810
        },
        {
            "_id": "67c9a49f15590866b5d0c3bb",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe294ea0490-ead6-4ae1-b090-0b765496ab67",
                "name": "google-hc"
            },
            "category": "RANDOM",
            "createdAt": 1741267860000,
            "lastmodifiedDate": 1741267888213,
            "measurementDate": 1741267860000,
            "type": "bloodglucose",
            "value": 900
        }
    ]
}

const nutritionData = {
    "goalAverage": 2900,
    "actualAverage": 944.3695652173915,
    "unit": "kcal",
    "logs": [
        {
            "createdAt": 1741305600000,
            "consumed": 485.3,
            "goal": 2900
        },
        {
            "createdAt": 1741219200000,
            "consumed": 10.4,
            "goal": 2900
        },
        {
            "createdAt": 1741132800000,
            "consumed": 9.4,
            "goal": 2900
        },
        {
            "createdAt": 1740614400000,
            "consumed": 519,
            "goal": 3485.1
        },
        {
            "createdAt": 1740528000000,
            "consumed": 4.2,
            "goal": 3485.1
        },
        {
            "createdAt": 1740441600000,
            "consumed": 31,
            "goal": 3485.1
        },
        {
            "createdAt": 1739491200000,
            "consumed": 3114,
            "goal": 2517
        },
        {
            "createdAt": 1739145600000,
            "consumed": 135,
            "goal": 2517.0068027210887
        },
        {
            "createdAt": 1738800000000,
            "consumed": 519,
            "goal": 5000
        },
        {
            "createdAt": 1738022400000,
            "consumed": 14040,
            "goal": 2279.25
        },
        {
            "createdAt": 1737936000000,
            "consumed": 98.4,
            "goal": 2100.35
        },
        {
            "createdAt": 1737504000000,
            "consumed": 111.4,
            "goal": 5175
        },
        {
            "createdAt": 1736985600000,
            "consumed": 661,
            "goal": 11325
        },
        {
            "createdAt": 1736726400000,
            "consumed": 9,
            "goal": 11325
        },
        {
            "createdAt": 1736208000000,
            "consumed": 200,
            "goal": 1750
        },
        {
            "createdAt": 1734912000000,
            "consumed": 4.2,
            "goal": 2500
        },
        {
            "createdAt": 1734825600000,
            "consumed": 488,
            "goal": 2500
        },
        {
            "createdAt": 1734739200000,
            "consumed": 4,
            "goal": 2500
        },
        {
            "createdAt": 1734480000000,
            "consumed": 4,
            "goal": 2500
        },
        {
            "createdAt": 1734307200000,
            "consumed": 4.2,
            "goal": 2725
        },
        {
            "createdAt": 1734220800000,
            "consumed": 400,
            "goal": 2725
        },
        {
            "createdAt": 1734134400000,
            "consumed": 661,
            "goal": 2725
        },
        {
            "createdAt": 1733875200000,
            "consumed": 208,
            "goal": 17500
        }
    ],
    "benchMarks": {
        "lowBorderline": {
            "min": 1740,
            "max": 2320
        },
        "normal": {
            "min": 2320,
            "max": 3480
        },
        "highBorderline": {
            "min": 3480,
            "max": 4059.9999999999995
        }
    },
    "currentGoal": 2900
}

const hydrateData = {
    "goalAverage": 10000,
    "actualAverage": 2025.8620689655172,
    "unit": "ml",
    "logs": [
        {
            "createdAt": 1741219200000,
            "consumed": 1750,
            "goal": 10000
        },
        {
            "createdAt": 1741132800000,
            "consumed": 250,
            "goal": 10000
        },
        {
            "createdAt": 1740960000000,
            "consumed": 500,
            "goal": 10000
        },
        {
            "createdAt": 1740873600000,
            "consumed": 750,
            "goal": 10000
        },
        {
            "createdAt": 1740009600000,
            "consumed": 500,
            "goal": 10000
        },
        {
            "createdAt": 1739923200000,
            "consumed": 2250,
            "goal": 100000
        },
        {
            "createdAt": 1739404800000,
            "consumed": 250,
            "goal": 100000
        },
        {
            "createdAt": 1739145600000,
            "consumed": 250,
            "goal": 100000
        },
        {
            "createdAt": 1738886400000,
            "consumed": 5000,
            "goal": 100000
        },
        {
            "createdAt": 1738800000000,
            "consumed": 6000,
            "goal": 100000
        },
        {
            "createdAt": 1738713600000,
            "consumed": 12000,
            "goal": 100000
        },
        {
            "createdAt": 1738368000000,
            "consumed": 250,
            "goal": 100000
        },
        {
            "createdAt": 1738022400000,
            "consumed": 14250,
            "goal": 0
        },
        {
            "createdAt": 1737504000000,
            "consumed": 250,
            "goal": 6700
        },
        {
            "createdAt": 1737417600000,
            "consumed": 750,
            "goal": 6700
        },
        {
            "createdAt": 1737331200000,
            "consumed": 2500,
            "goal": 2300
        },
        {
            "createdAt": 1737072000000,
            "consumed": 1750,
            "goal": 2300
        },
        {
            "createdAt": 1736208000000,
            "consumed": 750,
            "goal": 0
        },
        {
            "createdAt": 1736035200000,
            "consumed": 250,
            "goal": 0
        },
        {
            "createdAt": 1734912000000,
            "consumed": 250,
            "goal": 0
        },
        {
            "createdAt": 1734825600000,
            "consumed": 500,
            "goal": 0
        },
        {
            "createdAt": 1734739200000,
            "consumed": 1000,
            "goal": 0
        },
        {
            "createdAt": 1734480000000,
            "consumed": 500,
            "goal": 0
        },
        {
            "createdAt": 1734307200000,
            "consumed": 750,
            "goal": 0
        },
        {
            "createdAt": 1734220800000,
            "consumed": 500,
            "goal": 0
        },
        {
            "createdAt": 1734134400000,
            "consumed": 1000,
            "goal": 0
        },
        {
            "createdAt": 1733184000000,
            "consumed": 3250,
            "goal": 0
        },
        {
            "createdAt": 1731974400000,
            "consumed": 500,
            "goal": 8300
        },
        {
            "createdAt": 1731801600000,
            "consumed": 250,
            "goal": 8300
        }
    ],
    "benchMarks": null
}

// Example usage:
generatePDF(
    { name: "Milyn CC", age: 45 },
    temperatureData,
    heartRateData,
    bloodPressureData,
    bloodGlucoseData,
    nutritionData,
    hydrateData,
    120
);

