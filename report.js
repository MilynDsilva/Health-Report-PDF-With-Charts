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

/**
 * Generates a line chart of weight in lbs (converted from kg).
 * The logs have `createdAt` as the timestamp, `value` in kg.
 */
async function generateWeightChart(weightData, timeframeDays) {
    // 1) Filter & sort logs by date
    const filteredLogs = filterNutritionLogsByTimeframe(weightData.logs, timeframeDays)
        .sort((a, b) => a.createdAt - b.createdAt);

    // 2) Convert each log’s kg value to lbs
    const chartData = filteredLogs.map(d => ({
        x: d.createdAt,                // numeric timestamp
        y: d.value * 2.20462           // kg -> lbs
    }));

    // 3) Color all points red (since no valid benchmark ranges)
    const colors = filteredLogs.map(() => "#FA114F");

    // 4) Build Chart.js configuration
    const configuration = {
        type: "line",
        data: {
            datasets: [
                {
                    label: "Weight (lbs)",
                    data: chartData,
                    borderColor: "#636363",
                    backgroundColor: "rgba(0,0,0,0)",
                    pointBackgroundColor: colors,
                    pointBorderColor: colors,
                    borderDash: [10, 10],  // dotted line
                    spanGaps: true
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
                    title: { display: true, text: "Pounds (lbs)" }
                }
            },
            plugins: {
                legend: { position: "bottom" }
            }
        }
    };

    // 5) Render chart to buffer
    return chartJSNodeCanvas.renderToBuffer(configuration);
}

/**
 * Generates an activity chart with:
 *   - A horizontal goal line at `activityData.calories`.
 *   - A dotted line for daily `caloriesBurnt`.
 *   - Color-coded points based on benchmark ranges:
 *       - Normal => green
 *       - Borderline => orange
 *       - Outlier => red
 */
async function generateActivityChart(activityData, timeframeDays) {
    // 1) Filter & sort logs by date so the line is chronological
    const filteredLogs = filterDataByTimeframe(activityData.logs, timeframeDays)
        .sort((a, b) => a.measurementDate - b.measurementDate);

    // 2) Convert logs => Chart.js data points for daily `caloriesBurnt`
    const achievedData = filteredLogs.map(d => ({
        x: d.measurementDate,
        y: d.caloriesBurnt
    }));

    // 3) Color-code each point based on whether `caloriesBurnt` is normal, borderline, or outlier
    function classifyBurnt(value) {
        const { lowBorderline, normal, highBorderline } = activityData.benchMarks;

        // If no valid benchmarks, just default all to red or some color
        if (!lowBorderline || !normal || !highBorderline) {
            return "#FA114F"; // red
        }

        // Outlier if below lowBorderline.min or above highBorderline.max
        if (value < lowBorderline.min || value > highBorderline.max) {
            return "#FA114F"; // red outlier
        }

        // Borderline if in the lowBorderline range or the highBorderline range
        const inLowBorder = (value >= lowBorderline.min && value <= lowBorderline.max);
        const inHighBorder = (value >= highBorderline.min && value <= highBorderline.max);
        if (inLowBorder || inHighBorder) {
            return "#FFA63E"; // orange borderline
        }

        // Otherwise normal
        return "#00B050"; // green
    }

    const colors = filteredLogs.map(d => classifyBurnt(d.caloriesBurnt));

    // 4) Create a horizontal "Goal" line from earliest date to latest date
    //    using `activityData.calories` as the y-value.
    let goalLineData = [];
    if (achievedData.length > 0) {
        const earliest = achievedData[0].x;
        const latest = achievedData[achievedData.length - 1].x;
        goalLineData = [
            { x: earliest, y: activityData.calories },
            { x: latest, y: activityData.calories }
        ];
    }

    // 5) Build the Chart.js configuration
    const configuration = {
        type: "line",
        data: {
            datasets: [
                {
                    label: "Achieved",
                    data: achievedData,
                    borderColor: "#636363",
                    backgroundColor: "rgba(0,0,0,0)",
                    pointBackgroundColor: colors,
                    pointBorderColor: colors,
                    borderDash: [10, 10],  // dotted line
                    spanGaps: true
                },
                {
                    label: `Goal (${activityData.calories.toFixed(2)} ${activityData.unit})`,
                    data: goalLineData,
                    borderColor: "#0047FF", // blue line
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
                    title: { display: true, text: `Calorie (${activityData.unit})` }
                }
            },
            plugins: {
                legend: { position: "bottom" }
            }
        }
    };

    // 6) Render chart to buffer
    return chartJSNodeCanvas.renderToBuffer(configuration);
}

/**
* Generates a line chart for step count, filtered by logs from "garmin-connect".
* - A horizontal line for `stepData.goalAverage`.
* - A dotted line for daily step values (color-coded normal/borderline/outlier).
*/
async function generateStepCountChart(stepData, timeframeDays) {
    // 1) Filter logs by source = "garmin-connect"
    const garminLogs = stepData.logs.filter(
        log => log.source && log.source.name === "garmin-connect"
    );

    // 2) Filter logs by timeframe
    const filteredLogs = filterDataByTimeframe(garminLogs, timeframeDays)
        .sort((a, b) => a.measurementDate - b.measurementDate);

    // 3) Convert logs => Chart.js data points
    const stepDataPoints = filteredLogs.map(d => ({
        x: d.measurementDate,
        y: d.value
    }));

    // 4) Color-code each point based on benchmark ranges
    function classifySteps(value) {
        const { lowBorderline, normal, highBorderline } = stepData.benchMarks;

        // If no valid ranges, just color all red
        if (!lowBorderline || !normal || !highBorderline) {
            return "#FA114F"; // red
        }

        // Outlier if < lowBorderline.min or > highBorderline.max
        if (value < lowBorderline.min || value > highBorderline.max) {
            return "#FA114F"; // red outlier
        }

        // Borderline if in [lowBorderline.min..lowBorderline.max] or [highBorderline.min..highBorderline.max]
        const inLowBorder = (value >= lowBorderline.min && value <= lowBorderline.max);
        const inHighBorder = (value >= highBorderline.min && value <= highBorderline.max);
        if (inLowBorder || inHighBorder) {
            return "#FFA63E"; // orange borderline
        }

        // Otherwise normal
        return "#00B050"; // green
    }

    const colors = filteredLogs.map(d => classifySteps(d.value));

    // 5) Build a horizontal goal line from earliest to latest date
    //    using `stepData.goalAverage` as y-value
    let goalLineData = [];
    if (stepDataPoints.length > 0) {
        const earliest = stepDataPoints[0].x;
        const latest = stepDataPoints[stepDataPoints.length - 1].x;
        goalLineData = [
            { x: earliest, y: stepData.goalAverage },
            { x: latest, y: stepData.goalAverage }
        ];
    }

    // 6) Create Chart.js configuration
    const configuration = {
        type: "line",
        data: {
            datasets: [
                {
                    label: "Achieved",
                    data: stepDataPoints,
                    borderColor: "#636363",
                    backgroundColor: "rgba(0,0,0,0)",
                    pointBackgroundColor: colors,
                    pointBorderColor: colors,
                    borderDash: [10, 10], // dotted line
                    spanGaps: true
                },
                {
                    label: `Goal (${stepData.goalAverage} ${stepData.unit})`,
                    data: goalLineData,
                    borderColor: "#0047FF", // blue line
                    pointRadius: 0
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
                    title: { display: true, text: stepData.unit }
                }
            },
            plugins: {
                legend: { position: "bottom" }
            }
        }
    };

    // 7) Render chart to buffer
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
    weightData,
    activityData,
    stepData,
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

        doc.moveDown(100);

        if (weightData) {
            doc.addPage(); // optional if you want a new page for weight

            doc.fontSize(16)
                .text(`Weight (Last ${timeframeDays} days)`, { align: "center" })
                .moveDown();

            // Current weight in lbs
            const currentWeightLbs = weightData.currentWeight
                ? (weightData.currentWeight * 2.20462).toFixed(2)
                : "-";

            // Find the lowest weight from logs
            const allValues = weightData.logs.map(log => log.value);
            const lowestLog = allValues.length
                ? weightData.logs.reduce((min, log) => (log.value < min.value ? log : min))
                : null;
            const lowestWeightKg = lowestLog ? lowestLog.value : "-";
            const lowestWeightDate = lowestLog
                ? moment(lowestLog.createdAt).tz(TIMEZONE).format("DD MMM YYYY")
                : "-";
            const lowestWeightLbs = lowestLog
                ? (lowestWeightKg * 2.20462).toFixed(2)
                : "-";

            doc.fontSize(12)
                .text(`Current Weight: ${currentWeightLbs} lbs`, { align: "left" })
                .moveDown(0.5)
                .text(`Lowest Weight: ${lowestWeightLbs} lbs on ${lowestWeightDate}`, { align: "left" })
                .moveDown(1.5);

            // Generate & embed the weight chart
            const weightChartImage = await generateWeightChart(weightData, timeframeDays);
            doc.image(weightChartImage, {
                width: 550,
                align: "center",
                valign: "center",
                x: (doc.page.width - 550) / 2
            }).moveDown(3);
        }

        doc.moveDown(100);
        if (activityData) {
            doc.addPage(); // optional if you want a fresh page

            doc.fontSize(16)
                .text(`Activity (Last ${timeframeDays} days)`, { align: "center" })
                .moveDown();

            // Summaries
            const goalCal = activityData.calories?.toFixed(2) || "-";
            const achievedCal = activityData.caloriesBurnt?.toFixed(2) || "-";

            doc.fontSize(12)
                .text(`Goal: ${goalCal} ${activityData.unit}`, { align: "left" })
                .moveDown(0.5)
                .text(`Current Achieved: ${achievedCal} ${activityData.unit}`, { align: "left" })
                .moveDown(1);

            // Generate & embed the activity chart
            const activityChartImage = await generateActivityChart(activityData, timeframeDays);
            doc.image(activityChartImage, {
                width: 550,
                align: "center",
                valign: "center",
                x: (doc.page.width - 550) / 2
            }).moveDown(3);
        }

        doc.moveDown(100);
        if (stepData) {
            doc.addPage(); // optional if you want a fresh page

            doc.fontSize(16)
                .text(`Step Count (Last ${timeframeDays} days)`, { align: "center" })
                .moveDown();

            // Summaries
            const goalAvg = stepData.goalAverage?.toFixed(2) || "-";
            const actualAvg = stepData.actualAverage?.toFixed(2) || "-";

            doc.fontSize(12)
                .text(`Goal: ${goalAvg} ${stepData.unit} - Garmin Connect`, { align: "left" })
                .moveDown(0.5)
                .text(`Actual Average: ${actualAvg} ${stepData.unit}`, { align: "left" })
                .moveDown(1);

            // Generate & embed the step count chart
            const stepChartImage = await generateStepCountChart(stepData, timeframeDays);
            doc.image(stepChartImage, {
                width: 550,
                align: "center",
                valign: "center",
                x: (doc.page.width - 550) / 2
            }).moveDown(3);
        }

        //doc.moveDown(100)

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

const weightData = {
    "goalAverage": 0,
    "currentWeight": 116,
    "logs": [
        {
            "source": null,
            "_id": "67c69ad2e1280b8f2b716202",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 116,
            "goal": 0,
            "createdAt": 1741069010064,
            "updatedAt": 1741069010064
        },
        {
            "source": null,
            "_id": "67c68f3be1280bdceb7161fc",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 116.12,
            "goal": 0,
            "createdAt": 1741066043792,
            "updatedAt": 1741066043792
        },
        {
            "source": null,
            "_id": "67c68f3be1280b40807161f9",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 116,
            "goal": 0,
            "createdAt": 1741066043427,
            "updatedAt": 1741066043427
        },
        {
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2B951402C-9C24-46EC-A374-914B017111AB"
            },
            "_id": "67c7bf8915590866b5c021b8",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "createdAt": 1740631680000,
            "goal": 0,
            "lastmodifiedDate": 1740631680000,
            "measurementDate": 1740631680000,
            "type": "weight",
            "value": 302.09251842000003
        },
        {
            "source": null,
            "_id": "67bf12575562fad6faa1097f",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 116.17,
            "goal": 0,
            "createdAt": 1740575319781,
            "updatedAt": 1740575319781
        },
        {
            "source": null,
            "_id": "67bef52d6306f7dcf38c5d52",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 116.1451247165533,
            "goal": 0,
            "createdAt": 1740567853451,
            "updatedAt": 1740567853451
        },
        {
            "source": null,
            "_id": "67bd56969ce34f25f693adfd",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 112.94,
            "goal": 0,
            "createdAt": 1740461718956,
            "updatedAt": 1740461718956
        },
        {
            "source": null,
            "_id": "67bbf574fbbb529f3523ad2a",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 113.4,
            "goal": 0,
            "createdAt": 1740371316511,
            "updatedAt": 1740371316511
        },
        {
            "source": null,
            "_id": "67bbf433fbbb52c05d23ad21",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 100,
            "goal": 0,
            "createdAt": 1740370995782,
            "updatedAt": 1740370995782
        },
        {
            "source": null,
            "_id": "67bbf18dfbbb523ff823ad1b",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 56.7,
            "goal": 0,
            "createdAt": 1740370317451,
            "updatedAt": 1740370317451
        },
        {
            "source": null,
            "_id": "67bbf14bfbbb524a7923ad15",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 45,
            "goal": 0,
            "createdAt": 1740370251452,
            "updatedAt": 1740370251452
        },
        {
            "source": null,
            "_id": "67b8961efbbb52808923ad12",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 170,
            "goal": 0,
            "createdAt": 1740150302270,
            "updatedAt": 1740150302270
        },
        {
            "source": null,
            "_id": "67b88d84fbbb5294d623ad0f",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 167,
            "goal": 0,
            "createdAt": 1740148100849,
            "updatedAt": 1740148100849
        },
        {
            "source": null,
            "_id": "67b88c67fbbb52329923ad09",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 500,
            "goal": 0,
            "createdAt": 1740147815222,
            "updatedAt": 1740147815222
        },
        {
            "source": null,
            "_id": "67b8196bfbbb52cfc223acfe",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 90,
            "goal": 0,
            "createdAt": 1740118379581,
            "updatedAt": 1740118379581
        },
        {
            "source": null,
            "_id": "67b8191bfbbb529c4523acf9",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 88,
            "goal": 0,
            "createdAt": 1740118299163,
            "updatedAt": 1740118299163
        },
        {
            "source": null,
            "_id": "67b8089ffbbb52a88223acf2",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 86,
            "goal": 0,
            "createdAt": 1740114079733,
            "updatedAt": 1740114079733
        },
        {
            "source": null,
            "_id": "67b80842fbbb524e4923aced",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 87,
            "goal": 0,
            "createdAt": 1740113986766,
            "updatedAt": 1740113986766
        },
        {
            "source": null,
            "_id": "67b807b9fbbb522b6f23acea",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 181,
            "goal": 0,
            "createdAt": 1740113849329,
            "updatedAt": 1740113849329
        },
        {
            "source": null,
            "_id": "67b806e6fbbb52749d23ace7",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 126,
            "goal": 0,
            "createdAt": 1740113638022,
            "updatedAt": 1740113638022
        },
        {
            "source": null,
            "_id": "67b80625fbbb52bc9923ace4",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 87,
            "goal": 0,
            "createdAt": 1740113445675,
            "updatedAt": 1740113445675
        },
        {
            "source": null,
            "_id": "67b8060ffbbb52daf823ace0",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 89,
            "goal": 0,
            "createdAt": 1740113423398,
            "updatedAt": 1740113423398
        },
        {
            "source": {
                "id": "6723041b7ee984705f6bfbe214af11a7-bc9d-49ec-ace2-2b054b95b66e",
                "name": "google-hc"
            },
            "_id": "67bf070db4a0e54776557b54",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "createdAt": 1739945700000,
            "goal": 0,
            "lastmodifiedDate": 1739945751582,
            "measurementDate": 1739945700000,
            "type": "weight",
            "value": 73
        },
        {
            "source": null,
            "_id": "67aeefbc401febd5aa5f1511",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 90,
            "goal": 0,
            "createdAt": 1739517884071,
            "updatedAt": 1739517884071
        },
        {
            "source": null,
            "_id": "67aec85d401febef285f1505",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 101,
            "goal": 0,
            "createdAt": 1739507805111,
            "updatedAt": 1739507805111
        },
        {
            "source": null,
            "_id": "67ac5d4f56ebd54c8b208e28",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 100.68,
            "goal": 0,
            "createdAt": 1739349327107,
            "updatedAt": 1739349327107
        },
        {
            "source": null,
            "_id": "67ac56f331d90d236ed4097a",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 100,
            "goal": 0,
            "createdAt": 1739347699979,
            "updatedAt": 1739347699979
        },
        {
            "source": null,
            "_id": "67ac425331d90d2339d40976",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 100.68,
            "goal": 0,
            "createdAt": 1739342419131,
            "updatedAt": 1739342419131
        },
        {
            "source": null,
            "_id": "67a9d07031d90d2204d40955",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 100.68027210884354,
            "goal": 0,
            "createdAt": 1739182192459,
            "updatedAt": 1739182192459
        },
        {
            "source": null,
            "_id": "67a9d04e31d90d53ded40952",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 22,
            "goal": 0,
            "createdAt": 1739182158569,
            "updatedAt": 1739182158569
        },
        {
            "source": null,
            "_id": "6799e17528579408278c1ef8",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 200,
            "goal": 0,
            "createdAt": 1738137973777,
            "updatedAt": 1738137973777
        },
        {
            "source": null,
            "_id": "6799cab02857945df08c1ea5",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 100,
            "goal": 0,
            "createdAt": 1738132144449,
            "updatedAt": 1738132144449
        },
        {
            "source": null,
            "_id": "6799bfc82857942a988c1e9c",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 373,
            "goal": 0,
            "createdAt": 1738129352280,
            "updatedAt": 1738129352280
        },
        {
            "source": null,
            "_id": "6799bf44285794a3618c1e9a",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 6.802721088435374,
            "goal": 0,
            "createdAt": 1738129220457,
            "updatedAt": 1738129220457
        },
        {
            "source": null,
            "_id": "6799bf23285794b11c8c1e95",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 9.070294784580499,
            "goal": 0,
            "createdAt": 1738129187395,
            "updatedAt": 1738129187395
        },
        {
            "source": null,
            "_id": "6799beb828579446d28c1e91",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 126,
            "goal": 0,
            "createdAt": 1738129080904,
            "updatedAt": 1738129080904
        },
        {
            "source": null,
            "_id": "6799bbe1285794c8968c1e8d",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 634.9206349206349,
            "goal": 0,
            "createdAt": 1738128353752,
            "updatedAt": 1738128353752
        },
        {
            "source": null,
            "_id": "6799b892285794e6aa8c1e89",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 9.070294784580499,
            "goal": 0,
            "createdAt": 1738127506876,
            "updatedAt": 1738127506876
        },
        {
            "source": null,
            "_id": "6799a738285794b5e88c1e59",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 69,
            "goal": 0,
            "createdAt": 1738123064834,
            "updatedAt": 1738123064834
        },
        {
            "source": null,
            "_id": "6799a6ff28579405b58c1e57",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 50,
            "goal": 0,
            "createdAt": 1738123007645,
            "updatedAt": 1738123007645
        },
        {
            "source": null,
            "_id": "6799a6e02857941c8d8c1e54",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 98,
            "goal": 0,
            "createdAt": 1738122976378,
            "updatedAt": 1738122976378
        },
        {
            "source": null,
            "_id": "6799a2f92857943d828c1e4c",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 73,
            "goal": 0,
            "createdAt": 1738121977453,
            "updatedAt": 1738121977453
        },
        {
            "source": null,
            "_id": "67999e4b285794929b8c1e49",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 97,
            "goal": 0,
            "createdAt": 1738120779071,
            "updatedAt": 1738120779071
        },
        {
            "source": null,
            "_id": "67999dbe2857941f938c1e46",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 69,
            "goal": 0,
            "createdAt": 1738120638128,
            "updatedAt": 1738120638128
        },
        {
            "source": null,
            "_id": "6798816274fe5d6c2fca13f1",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 100,
            "goal": 0,
            "createdAt": 1738047842307,
            "updatedAt": 1738047842307
        },
        {
            "source": null,
            "_id": "6798816174fe5d5f7eca13ee",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 100,
            "goal": 0,
            "createdAt": 1738047841895,
            "updatedAt": 1738047841895
        },
        {
            "source": null,
            "_id": "6798615d74fe5d4176ca13b9",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 91.17,
            "goal": 0,
            "createdAt": 1738039645207,
            "updatedAt": 1738039645207
        },
        {
            "source": null,
            "_id": "67985f7274fe5d137bca13b6",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 90.70294784580499,
            "goal": 0,
            "createdAt": 1738039154102,
            "updatedAt": 1738039154102
        },
        {
            "source": null,
            "_id": "678a0d0b111bcebd6e50ebd5",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 70,
            "goal": 0,
            "createdAt": 1737100555989,
            "updatedAt": 1737100555989
        },
        {
            "source": null,
            "_id": "678a0cbb111bcee77550ebd3",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 70,
            "goal": 0,
            "createdAt": 1737100475111,
            "updatedAt": 1737100475111
        },
        {
            "source": null,
            "_id": "678a0678111bcefe5750ebd2",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 400,
            "goal": 0,
            "createdAt": 1737098872975,
            "updatedAt": 1737098872975
        },
        {
            "source": null,
            "_id": "678a0678111bce2ace50ebcf",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 400,
            "goal": 0,
            "createdAt": 1737098872586,
            "updatedAt": 1737098872586
        },
        {
            "source": null,
            "_id": "6787bd52bd58bcd6813851b3",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 453,
            "goal": 0,
            "createdAt": 1736949074616,
            "updatedAt": 1736949074616
        },
        {
            "source": null,
            "_id": "67829548f100d56cd075e0b0",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 453,
            "goal": 0,
            "createdAt": 1736611144377,
            "updatedAt": 1736611144377
        },
        {
            "source": null,
            "_id": "67829538f100d562dd75e0ae",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 453,
            "goal": 0,
            "createdAt": 1736611128426,
            "updatedAt": 1736611128426
        },
        {
            "source": null,
            "_id": "6782184b8bcd15bf818e80eb",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 453.01,
            "goal": 0,
            "createdAt": 1736579147262,
            "updatedAt": 1736579147262
        },
        {
            "source": null,
            "_id": "678108478bcd15ce5d8e80e0",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 453,
            "goal": 0,
            "createdAt": 1736509511181,
            "updatedAt": 1736509511181
        },
        {
            "source": null,
            "_id": "6780d1344e36fa38b18c3b8b",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 453.14,
            "goal": 0,
            "createdAt": 1736495412854,
            "updatedAt": 1736495412854
        },
        {
            "source": null,
            "_id": "677f9af3ad141ada9f292371",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 1102,
            "goal": 0,
            "createdAt": 1736415987713,
            "updatedAt": 1736415987713
        },
        {
            "source": null,
            "_id": "677ece2cb2bc3b77d4aa94dd",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 1102,
            "goal": 0,
            "createdAt": 1736363564290,
            "updatedAt": 1736363564290
        },
        {
            "source": null,
            "_id": "677d4c4d672728d24042d55f",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 750,
            "goal": 0,
            "createdAt": 1736264781665,
            "updatedAt": 1736264781665
        },
        {
            "source": null,
            "_id": "677d3a37672728b56242d55b",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 340,
            "goal": 0,
            "createdAt": 1736260151526,
            "updatedAt": 1736260151526
        },
        {
            "source": null,
            "_id": "677d315c672728582642d558",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 154,
            "goal": 0,
            "createdAt": 1736257884659,
            "updatedAt": 1736257884659
        },
        {
            "source": null,
            "_id": "677d0b15672728457742d54d",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 70,
            "goal": 0,
            "createdAt": 1736248085443,
            "updatedAt": 1736248085443
        },
        {
            "source": null,
            "_id": "677d0a81672728800242d54b",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 70,
            "goal": 0,
            "createdAt": 1736247937995,
            "updatedAt": 1736247937995
        },
        {
            "source": null,
            "_id": "677cbd12c1d5c00e33d4e4e4",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 70,
            "goal": 0,
            "createdAt": 1736228114897,
            "updatedAt": 1736228114897
        },
        {
            "source": null,
            "_id": "677c30c3c1d5c04e4fd4e4df",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 100.68027210884354,
            "goal": 0,
            "createdAt": 1736192195506,
            "updatedAt": 1736192195506
        },
        {
            "source": null,
            "_id": "677a48e0f13e236be39580ed",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 1102,
            "goal": 0,
            "createdAt": 1736067296463,
            "updatedAt": 1736067296463
        },
        {
            "source": null,
            "_id": "67782a03f13e234bda9580e6",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 500,
            "goal": 0,
            "createdAt": 1735928323062,
            "updatedAt": 1735928323062
        },
        {
            "source": null,
            "_id": "6778138fb2537462f28f5ab7",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 1102,
            "goal": 0,
            "createdAt": 1735922575742,
            "updatedAt": 1735922575742
        },
        {
            "source": null,
            "_id": "6777dc3239d63d2d157091b5",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 1102,
            "goal": 0,
            "createdAt": 1735908402803,
            "updatedAt": 1735908402803
        },
        {
            "source": null,
            "_id": "6777d0990f96460f1269aa80",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 536,
            "goal": 0,
            "createdAt": 1735905433804,
            "updatedAt": 1735905433804
        },
        {
            "source": null,
            "_id": "6777c1fd20fbe339ca34d15c",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 243,
            "goal": 0,
            "createdAt": 1735901693555,
            "updatedAt": 1735901693555
        },
        {
            "source": null,
            "_id": "6777b4cbd8659d6c7a3fff3b",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 110,
            "goal": 0,
            "createdAt": 1735898315682,
            "updatedAt": 1735898315682
        },
        {
            "source": null,
            "_id": "6777b4b0d8659d4ca73fff37",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 5,
            "goal": 0,
            "createdAt": 1735898288694,
            "updatedAt": 1735898288694
        },
        {
            "source": null,
            "_id": "6777b46ed8659d4e283fff34",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 110,
            "goal": 0,
            "createdAt": 1735898222266,
            "updatedAt": 1735898222266
        },
        {
            "source": null,
            "_id": "6777b120d8659dfaa63fff32",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 243,
            "goal": 0,
            "createdAt": 1735897376421,
            "updatedAt": 1735897376421
        },
        {
            "source": null,
            "_id": "67779208d8659d4f6f3fff28",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 110,
            "goal": 0,
            "createdAt": 1735889416420,
            "updatedAt": 1735889416420
        },
        {
            "source": null,
            "_id": "67766e9219d5120e35c65881",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 50,
            "goal": 0,
            "createdAt": 1735814802666,
            "updatedAt": 1735814802666
        },
        {
            "source": null,
            "_id": "67766d5a19d512009fc6587e",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 5,
            "goal": 0,
            "createdAt": 1735814490608,
            "updatedAt": 1735814490608
        },
        {
            "source": null,
            "_id": "6776638d19d5120c93c65864",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 0,
            "goal": 0,
            "createdAt": 1735811981295,
            "updatedAt": 1735811981295
        },
        {
            "source": null,
            "_id": "6776638c19d5124227c65860",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 217,
            "goal": 0,
            "createdAt": 1735811980961,
            "updatedAt": 1735811980961
        },
        {
            "source": null,
            "_id": "6776633e19d5123219c6585d",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 186,
            "goal": 0,
            "createdAt": 1735811902532,
            "updatedAt": 1735811902532
        },
        {
            "source": null,
            "_id": "6776630919d5120cf5c65859",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 409,
            "goal": 0,
            "createdAt": 1735811849908,
            "updatedAt": 1735811849908
        },
        {
            "source": null,
            "_id": "6776630919d512c42bc65856",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 186,
            "goal": 0,
            "createdAt": 1735811849539,
            "updatedAt": 1735811849539
        },
        {
            "source": null,
            "_id": "677662ef19d51222dcc65852",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 409,
            "goal": 0,
            "createdAt": 1735811823880,
            "updatedAt": 1735811823880
        },
        {
            "source": null,
            "_id": "677662ef19d51271bdc65850",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 186,
            "goal": 0,
            "createdAt": 1735811823423,
            "updatedAt": 1735811823423
        },
        {
            "source": null,
            "_id": "67765eada3ab4681c8566ca6",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 400,
            "goal": 0,
            "createdAt": 1735810733407,
            "updatedAt": 1735810733407
        },
        {
            "source": null,
            "_id": "67765e86935bff6fbc6302c9",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 500,
            "goal": 0,
            "createdAt": 1735810694118,
            "updatedAt": 1735810694118
        },
        {
            "source": null,
            "_id": "67765e76935bff6fbc6302c8",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 50,
            "goal": 0,
            "createdAt": 1735810678639,
            "updatedAt": 1735810678639
        },
        {
            "source": null,
            "_id": "67765e2f61116969e8c69bb4",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 50,
            "goal": 0,
            "createdAt": 1735810607026,
            "updatedAt": 1735810607026
        },
        {
            "source": null,
            "_id": "67761a2c02fe569244e91a8e",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 1102,
            "goal": 0,
            "createdAt": 1735793196315,
            "updatedAt": 1735793196315
        },
        {
            "source": null,
            "_id": "677589f702fe568c9fe91a89",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 500,
            "goal": 0,
            "createdAt": 1735756279466,
            "updatedAt": 1735756279466
        },
        {
            "source": null,
            "_id": "67756b59d39fc1e714550041",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 431,
            "goal": 0,
            "createdAt": 1735748441045,
            "updatedAt": 1735748441045
        },
        {
            "source": null,
            "_id": "67756b0fd39fc1b6e655003d",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 408,
            "goal": 0,
            "createdAt": 1735748367727,
            "updatedAt": 1735748367727
        },
        {
            "source": null,
            "_id": "67754231d39fc190de55003a",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 220,
            "goal": 0,
            "createdAt": 1735737905386,
            "updatedAt": 1735737905386
        },
        {
            "source": null,
            "_id": "67b806b1c82c960e9c0cdff8",
            "goal": 0,
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "updatedAt": 1740113585166,
            "value": 453.0612244897959,
            "createdAt": 1734756772000
        },
        {
            "source": null,
            "_id": "67613ea0024130225fe213b7",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 100,
            "goal": 0,
            "createdAt": 1734426272065,
            "updatedAt": 1734426272065
        },
        {
            "source": null,
            "_id": "675d4146e692df185cd0cb3f",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 109,
            "goal": 0,
            "createdAt": 1734164806316,
            "updatedAt": 1734164806316
        },
        {
            "source": null,
            "_id": "675d412ce692df185cd0cb3c",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 100,
            "goal": 0,
            "createdAt": 1734164780934,
            "updatedAt": 1734164780934
        },
        {
            "source": null,
            "_id": "675d3eebe692df185cd0cb38",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 99,
            "goal": 0,
            "createdAt": 1734164203363,
            "updatedAt": 1734164203363
        },
        {
            "source": null,
            "_id": "675d3d725f14072e9c76fd79",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 86,
            "goal": 0,
            "createdAt": 1734163826675,
            "updatedAt": 1734163826675
        },
        {
            "source": null,
            "_id": "675d3c1a3fbc8c70e83ec5a2",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 78,
            "goal": 0,
            "createdAt": 1734163482114,
            "updatedAt": 1734163482114
        },
        {
            "source": null,
            "_id": "675d3b7726ea447ce038d1b2",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 76,
            "goal": 0,
            "createdAt": 1734163319077,
            "updatedAt": 1734163319077
        },
        {
            "source": null,
            "_id": "675d3aac26ea447ce038d1b0",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 70,
            "goal": 0,
            "createdAt": 1734163116001,
            "updatedAt": 1734163116001
        },
        {
            "source": null,
            "_id": "675d3a8526ea447ce038d1af",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 55,
            "goal": 0,
            "createdAt": 1734163077496,
            "updatedAt": 1734163077496
        },
        {
            "source": null,
            "_id": "675d3a6626ea447ce038d1ad",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 55,
            "goal": 0,
            "createdAt": 1734163046130,
            "updatedAt": 1734163046130
        },
        {
            "source": null,
            "_id": "675d39fb26ea447ce038d1ac",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 50,
            "goal": 0,
            "createdAt": 1734162939574,
            "updatedAt": 1734162939574
        },
        {
            "source": null,
            "_id": "675d39ed26ea447ce038d1ab",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 50,
            "goal": 0,
            "createdAt": 1734162925993,
            "updatedAt": 1734162925993
        },
        {
            "source": null,
            "_id": "675d11449e721251d00a8784",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 49.99,
            "goal": 0,
            "createdAt": 1734152516034,
            "updatedAt": 1734152516034
        },
        {
            "source": null,
            "_id": "675beb269e72127b610a8764",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 226.75736961451247,
            "goal": 0,
            "createdAt": 1734077222910,
            "updatedAt": 1734077222910
        },
        {
            "source": null,
            "_id": "673ad76eaea9513d63ebeec8",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "weight",
            "value": 300,
            "goal": 0,
            "createdAt": 1731909486398,
            "updatedAt": 1731909486398
        }
    ],
    "benchMarks": {
        "lowBorderline": {
            "min": 0,
            "max": 0
        },
        "normal": {
            "min": 0,
            "max": 0
        },
        "highBorderline": {
            "min": 0,
            "max": 0
        }
    }
}

const activityData = {
    "type": "activity",
    "calories": 1620.6889999999999,
    "caloriesBurnt": 1512.2473277777779,
    "unit": "kcal",
    "logs": [
        {
            "id": "67c914e8e1280baaae71625c",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "measurementDate": 1741231328434,
            "lastmodifiedDate": 1741248764669,
            "value": [
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 360,
                    "name": "Walking",
                    "time": 50,
                    "calories": 296.4675,
                    "caloriesBurnt": 2192.4,
                    "activityId": "a7d8a4b6-bc37-484a-b8aa-9c980f207c19",
                    "createdAt": 1741231336085
                },
                {
                    "timeLogged": 0,
                    "id": "6769b62176414f37209b0f21",
                    "name": "Walking",
                    "time": 50,
                    "calories": 296.4675,
                    "caloriesBurnt": 0,
                    "activityId": "44237a02-2b98-4c9f-b8e9-e4568fe8b746",
                    "createdAt": 1741234860763
                },
                {
                    "timeLogged": 10,
                    "id": "6566c1d9c8779c645f16a31e",
                    "name": "Breathing Exercise",
                    "time": 50,
                    "calories": 197.645,
                    "caloriesBurnt": 40.6,
                    "activityId": "08e9cd81-28fe-4bfd-98af-45d77857456d",
                    "createdAt": 1741248764663
                }
            ],
            "source": {
                "name": "restore-me",
                "id": "42238125-1db4-498e-8bda-eea986f13859"
            },
            "calories": 1620.6889999999999,
            "caloriesBurnt": 2233
        },
        {
            "id": "67c73cb2e1280b509c716212",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "measurementDate": 1741110420000,
            "lastmodifiedDate": 1741110420000,
            "value": [
                {
                    "id": "6566c1d9c8779c645f16a31e",
                    "timeLogged": 30,
                    "name": "Breathing Exercise",
                    "time": 50,
                    "calories": 197.645,
                    "caloriesBurnt": 121.8,
                    "activityId": "ddcacef7-7e87-49fe-8fac-5b946eef72f6",
                    "createdAt": 1741110450923
                }
            ],
            "source": {
                "name": "restore-me",
                "id": "1785ff87-030b-412e-8ead-ec9765b5be7d"
            },
            "calories": 1620.6889999999999,
            "caloriesBurnt": 121.8
        },
        {
            "id": "67c17408b4a0e5477677161f",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "measurementDate": 1740727297000,
            "lastmodifiedDate": 1740740462550,
            "value": [
                {
                    "id": "6769b59176414f37209b0f1f",
                    "timeLogged": 75,
                    "name": "Cycling",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 374,
                    "activityId": "61e1846f-eb86-4c0f-aa49-09ab7f89fb89",
                    "createdAt": 1740731400778
                },
                {
                    "id": "6769b59176414f37209b0f1f",
                    "timeLogged": 75,
                    "name": "Cycling",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 374,
                    "activityId": "5d109877-23c4-43f6-9de8-582bf1ae8e67",
                    "createdAt": 1740737559757
                },
                {
                    "id": "6769b59176414f37209b0f1f",
                    "timeLogged": 75,
                    "name": "Cycling",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 374,
                    "activityId": "934540a5-5486-40be-b69d-9b752cdca6fe",
                    "createdAt": 1740737707362
                },
                {
                    "id": "6769b59176414f37209b0f1f",
                    "timeLogged": 75,
                    "name": "Cycling",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 374,
                    "activityId": "1b516b0c-9e59-4034-afbb-87b05b8d7eb9",
                    "createdAt": 1740738890262
                },
                {
                    "id": "6566c3e7c8779c645f16a328",
                    "timeLogged": 67,
                    "name": "Other Vigorous Activities",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 0,
                    "activityId": "9bfe89a2-3f3f-47ff-8186-83f8e56acd84",
                    "createdAt": 1740740462549
                },
                {
                    "id": "6566c3e7c8779c645f16a328",
                    "timeLogged": 67,
                    "name": "Other Vigorous Activities",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 0,
                    "activityId": "4efa84b7-c707-4654-bd7f-98152a55572b",
                    "createdAt": 1740740462550
                },
                {
                    "id": "6566c3e7c8779c645f16a328",
                    "timeLogged": 67,
                    "name": "Other Vigorous Activities",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 0,
                    "activityId": "6036c87e-ff58-4c81-a31c-374b9d1ff6dd",
                    "createdAt": 1740740462550
                }
            ],
            "source": {
                "name": "garmin-connect",
                "id": "8ad4cd25-584f-43bd-af21-37c153445307"
            },
            "calories": 1620.6889999999999,
            "caloriesBurnt": 1496
        },
        {
            "id": "67bdd6f36306f7dc288c5d36",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "measurementDate": 1740494572113,
            "lastmodifiedDate": 1740494685783,
            "value": [
                {
                    "timeLogged": 45,
                    "id": "6769b60676414f37209b0f20",
                    "name": "Gym & Fitness Equipment",
                    "time": 30,
                    "calories": 296.4675,
                    "caloriesBurnt": 444.70125,
                    "activityId": "9243bd64-82dc-4583-a2af-b48d53a53c5e",
                    "createdAt": 1740494579782
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 9,
                    "name": "Walking",
                    "time": 50,
                    "calories": 296.4675,
                    "caloriesBurnt": 53.36414999999999,
                    "activityId": "f1a56b3b-5d2f-4577-9ff5-c9f355bc2ca9",
                    "createdAt": 1740494673370
                },
                {
                    "timeLogged": 4,
                    "id": "6769b60676414f37209b0f20",
                    "name": "Gym & Fitness Equipment",
                    "time": 30,
                    "calories": 296.4675,
                    "caloriesBurnt": 39.529,
                    "activityId": "0866089a-5562-48c2-aec7-16538f3dc9e2",
                    "createdAt": 1740494685775
                }
            ],
            "source": {
                "name": "restore-me",
                "id": "017e2d2b-6122-4f4a-ad29-4d325f15246b"
            },
            "calories": 1620.6889999999999,
            "caloriesBurnt": 537.5944000000001
        },
        {
            "id": "67c17408b4a0e5477677161e",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "measurementDate": 1739095812000,
            "lastmodifiedDate": 1740740775019,
            "value": [
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 2,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 12,
                    "activityId": "430f97fd-0990-4fc1-b448-f30b118fab03",
                    "createdAt": 1740731400778
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 2,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 12,
                    "activityId": "290815b4-7e11-4cdf-9bcd-d127b38cdf90",
                    "createdAt": 1740737559756
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 2,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 12,
                    "activityId": "e0f19e12-99af-4035-80d2-61b7318b0975",
                    "createdAt": 1740738890262
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 2,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 12,
                    "activityId": "3b0cca9e-bfcd-49eb-9426-7b9424f14079",
                    "createdAt": 1740739349409
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 2,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 12,
                    "activityId": "014409f1-0286-4572-aea3-dcc4305c4782",
                    "createdAt": 1740740775019
                }
            ],
            "source": {
                "name": "garmin-connect",
                "id": "52da8a03-2c51-4a67-a977-ba39c88b4543"
            },
            "calories": 1620.6889999999999,
            "caloriesBurnt": 60
        },
        {
            "id": "6789ffa1111bcee60a50ebce",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "measurementDate": 1737097013031,
            "lastmodifiedDate": 1737098148934,
            "value": [
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 6,
                    "name": "Walking",
                    "time": 50,
                    "calories": 262.5,
                    "caloriesBurnt": 142.695,
                    "activityId": "eedec37c-3406-45ef-9cf3-d576cbe334be",
                    "createdAt": 1737097121453
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 10,
                    "name": "Walking",
                    "time": 50,
                    "calories": 262.5,
                    "caloriesBurnt": 237.825,
                    "activityId": "d5e6e781-910f-42da-ad6e-a86d28a41093",
                    "createdAt": 1737098007242
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 16,
                    "name": "Walking",
                    "time": 50,
                    "calories": 262.5,
                    "caloriesBurnt": 380.52,
                    "activityId": "c75518f5-9fa9-4873-b924-6e5607c383ac",
                    "createdAt": 1737098094818
                },
                {
                    "id": "6566c1d9c8779c645f16a31e",
                    "timeLogged": 122,
                    "name": "Breathing Exercise",
                    "time": 50,
                    "calories": 175,
                    "caloriesBurnt": 1934.31,
                    "activityId": "e0555ef9-14cb-4460-81ae-c9c9322761a0",
                    "createdAt": 1737098128537
                },
                {
                    "timeLogged": 4,
                    "id": "6769b62176414f37209b0f21",
                    "name": "Walking",
                    "time": 50,
                    "calories": 262.5,
                    "caloriesBurnt": 95.13,
                    "activityId": "533b1052-b64b-41e0-9c48-9503b747c0c9",
                    "createdAt": 1737098148925
                }
            ],
            "source": {
                "name": "restore-me",
                "id": "16df1627-b7eb-47dc-a89d-d5e012fb7619"
            },
            "calories": 1620.6889999999999,
            "caloriesBurnt": 2790.48
        },
        {
            "id": "6788c19f111bceb1b150ebaf",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "measurementDate": 1737015552594,
            "lastmodifiedDate": 1737028271507,
            "value": [
                {
                    "timeLogged": 38,
                    "id": "6769b62176414f37209b0f21",
                    "name": "Walking",
                    "time": 50,
                    "calories": 262.5,
                    "caloriesBurnt": 903.735,
                    "activityId": "acf2a306-e726-4a95-b585-480035a1d261",
                    "createdAt": 1737015711487
                },
                {
                    "timeLogged": 5,
                    "id": "6769b62176414f37209b0f21",
                    "name": "Walking",
                    "time": 50,
                    "calories": 262.5,
                    "caloriesBurnt": 118.9125,
                    "activityId": "60ec5f90-7fc0-4701-843e-c79cfb81dbda",
                    "createdAt": 1737015816280
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 4,
                    "name": "Walking",
                    "time": 50,
                    "calories": 262.5,
                    "caloriesBurnt": 95.13,
                    "activityId": "636b3c29-69ee-4226-9556-75a6884139d2",
                    "createdAt": 1737015897971
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 9,
                    "name": "Walking",
                    "time": 50,
                    "calories": 262.5,
                    "caloriesBurnt": 214.0425,
                    "activityId": "8f158a7f-9450-4943-aca4-26e21bd57407",
                    "createdAt": 1737015989834
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 12,
                    "name": "Walking",
                    "time": 50,
                    "calories": 262.5,
                    "caloriesBurnt": 285.39,
                    "activityId": "bb36999e-a179-43f9-a1a5-6ab22baad495",
                    "createdAt": 1737016130660
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 59,
                    "name": "Walking",
                    "time": 50,
                    "calories": 262.5,
                    "caloriesBurnt": 1403.1675,
                    "activityId": "9e8f3f4f-ebf0-4d75-9f15-c319ce91e2d1",
                    "createdAt": 1737016409203
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 120,
                    "name": "Walking",
                    "time": 50,
                    "calories": 262.5,
                    "caloriesBurnt": 2853.9,
                    "activityId": "49ad1fab-4984-4520-8ee0-85be0ea31a4b",
                    "createdAt": 1737016662656
                },
                {
                    "timeLogged": 4,
                    "id": "6769b62176414f37209b0f21",
                    "name": "Walking",
                    "time": 50,
                    "calories": 262.5,
                    "caloriesBurnt": 95.13,
                    "activityId": "37f2f9e0-fb72-4c53-bb4a-428d1495f0bf",
                    "createdAt": 1737017276349
                },
                {
                    "id": "6566c1d9c8779c645f16a31e",
                    "timeLogged": 30,
                    "name": "Breathing Exercise",
                    "time": 50,
                    "calories": 175,
                    "caloriesBurnt": 475.65,
                    "activityId": "ba010aeb-629f-46ae-babd-3d25581f0d51",
                    "createdAt": 1737027217816
                },
                {
                    "id": "6566c1d9c8779c645f16a31e",
                    "timeLogged": 30,
                    "name": "Breathing Exercise",
                    "time": 50,
                    "calories": 175,
                    "caloriesBurnt": 475.65,
                    "activityId": "f938a35b-84ba-4441-a7ed-da40c7a1ff7e",
                    "createdAt": 1737027233031
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 2,
                    "name": "Walking",
                    "time": 50,
                    "calories": 262.5,
                    "caloriesBurnt": 47.565,
                    "activityId": "26ff9bf8-006e-4dd2-8795-79352b40c9ce",
                    "createdAt": 1737028271503
                }
            ],
            "source": {
                "name": "restore-me",
                "id": "67c12ea5-bad8-4fcc-8c5a-df726c416af5"
            },
            "calories": 1620.6889999999999,
            "caloriesBurnt": 6968.272499999999
        },
        {
            "id": "67877df88a72d61473d76f0f",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "measurementDate": 1736932848657,
            "lastmodifiedDate": 1736933721275,
            "value": [
                {
                    "timeLogged": 0,
                    "id": "6566c1d9c8779c645f16a31e",
                    "name": "Breathing Exercise",
                    "time": 50,
                    "calories": 175,
                    "caloriesBurnt": 0,
                    "activityId": "5a0f1146-97e7-42ab-946e-50d3ca5c71a4",
                    "createdAt": 1736932856928
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 55,
                    "name": "Walking",
                    "time": 50,
                    "calories": 262.5,
                    "caloriesBurnt": 1308.0375,
                    "activityId": "161655b5-2670-4242-8c95-875ce649c682",
                    "createdAt": 1736932869067
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 14,
                    "name": "Walking",
                    "time": 50,
                    "calories": 262.5,
                    "caloriesBurnt": 332.955,
                    "activityId": "6a927743-7181-4c4c-b8cd-60f7ba8cfc3a",
                    "createdAt": 1736933693008
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 9,
                    "name": "Walking",
                    "time": 50,
                    "calories": 262.5,
                    "caloriesBurnt": 214.0425,
                    "activityId": "9f422a00-3b07-4f2f-81b9-fcbd780848b3",
                    "createdAt": 1736933721270
                }
            ],
            "source": {
                "name": "restore-me",
                "id": "b2401023-ad90-4781-be86-096d2cc74842"
            },
            "calories": 1620.6889999999999,
            "caloriesBurnt": 1855.0349999999999
        },
        {
            "id": "677c2337c1d5c0b81dd4e4de",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "measurementDate": 1736188694641,
            "lastmodifiedDate": 1736188694641,
            "value": [
                {
                    "timeLogged": 4,
                    "id": "6769b62176414f37209b0f21",
                    "name": "Walking",
                    "time": 50,
                    "calories": 262.5,
                    "caloriesBurnt": 231.42,
                    "activityId": "7df68810-b7f1-4007-ae86-3184979f36c8",
                    "createdAt": 1736188727905
                }
            ],
            "source": {
                "name": "restore-me",
                "id": "8fe285ec-066f-4d5e-a9d5-170d051e450d"
            },
            "calories": 1620.6889999999999,
            "caloriesBurnt": 231.42
        },
        {
            "id": "677b9de9e689e25090012544",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "measurementDate": 1736131690000,
            "lastmodifiedDate": 1736154601028,
            "value": [
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 11,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 29,
                    "activityId": "53ac1e6b-5f4c-4466-8fed-fbcbde180146",
                    "createdAt": 1736154601028
                }
            ],
            "source": {
                "name": "garmin-connect",
                "id": "7a3dd97c-a26b-4375-9da8-a57e08ff6e99"
            },
            "calories": 1620.6889999999999,
            "caloriesBurnt": 29
        },
        {
            "id": "677aaf0dc1d5c0f979d4e490",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "measurementDate": 1736093400000,
            "lastmodifiedDate": 1736093400000,
            "value": [
                {
                    "id": "6566c1d9c8779c645f16a31e",
                    "timeLogged": 30,
                    "name": "Breathing Exercise",
                    "time": 50,
                    "calories": 175,
                    "caloriesBurnt": 1157.1,
                    "activityId": "9d9196ad-a992-45da-9c01-ce90b730efb1",
                    "createdAt": 1736093453790
                }
            ],
            "source": {
                "name": "restore-me",
                "id": "dab8f962-a25a-4a57-8f2f-5a1643f1755b"
            },
            "calories": 1620.6889999999999,
            "caloriesBurnt": 1157.1
        },
        {
            "id": "677773d0d8659d27c83fff26",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "measurementDate": 1735881660000,
            "lastmodifiedDate": 1735898674399,
            "value": [
                {
                    "timeLogged": 68,
                    "id": "6566c3dac8779c645f16a327",
                    "name": "Other moderate activities",
                    "time": 30,
                    "calories": 315,
                    "caloriesBurnt": 357,
                    "activityId": "9f8e4c60-c490-4ed8-a909-c589db1de148",
                    "createdAt": 1735884081499
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 0,
                    "name": "Walking",
                    "time": 50,
                    "calories": 262.5,
                    "caloriesBurnt": 0,
                    "activityId": "1ffde364-cc0f-4ef5-938f-9a343f990a4b",
                    "createdAt": 1735898674395
                }
            ],
            "source": {
                "name": "restore-me",
                "id": "07f2526f-66d7-41a2-a308-7c8a9016b727"
            },
            "calories": 1620.6889999999999,
            "caloriesBurnt": 357
        },
        {
            "id": "676db746ba998f89cbc2a4b1",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "measurementDate": 1735243320000,
            "lastmodifiedDate": 1735317600715,
            "value": [
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 0,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 1,
                    "activityId": "e2da763c-0449-4fdc-9fb8-c6bb37772eb5",
                    "createdAt": 1735243590457
                },
                {
                    "id": "6769b60676414f37209b0f20",
                    "timeLogged": 6,
                    "name": "Gym & Fitness Equipment",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 9,
                    "activityId": "5dc4f0c3-0a66-45e9-8456-d698a87ae01c",
                    "createdAt": 1735243800867
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 38,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 92,
                    "activityId": "3a6c142f-8ed0-4f66-930d-88cffae60f09",
                    "createdAt": 1735317600715
                }
            ],
            "source": {
                "name": "garmin-connect",
                "id": "27728fae-bb13-47c5-8059-a2d1194dca5c"
            },
            "calories": 1620.6889999999999,
            "caloriesBurnt": 102
        },
        {
            "id": "676d69ff8bf414b807451db9",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "measurementDate": 1735223772782,
            "lastmodifiedDate": 1735223772782,
            "value": [
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 60,
                    "name": "Walking",
                    "time": 50,
                    "calories": 262.5,
                    "caloriesBurnt": 693,
                    "activityId": "0c2ab8fd-278b-40a4-8911-783a5a8b4f99",
                    "createdAt": 1735223807518
                }
            ],
            "source": {
                "name": "restore-me",
                "id": "2ff938bc-436e-4888-becb-352e80906db0"
            },
            "calories": 1620.6889999999999,
            "caloriesBurnt": 693
        },
        {
            "id": "676ce8ae21f4276cd9ea5c21",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "measurementDate": 1735186899000,
            "lastmodifiedDate": 1735227600207,
            "value": [
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 1628,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 68,
                    "activityId": "e1d8287a-0c5d-452f-9858-98c21fbb9db9",
                    "createdAt": 1735190702805
                },
                {
                    "id": "6769b60676414f37209b0f20",
                    "timeLogged": 490,
                    "name": "Gym & Fitness Equipment",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 45,
                    "activityId": "f2e72a56-627b-4e5e-8ba1-2e70b14dcca4",
                    "createdAt": 1735191258515
                },
                {
                    "id": "6769b57b76414f37209b0f1e",
                    "timeLogged": 1237,
                    "name": "Running",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 95,
                    "activityId": "dd293dc9-8f65-4841-92a8-9bbe3a02c515",
                    "createdAt": 1735195800628
                },
                {
                    "id": "6769b60676414f37209b0f20",
                    "timeLogged": 3850,
                    "name": "Gym & Fitness Equipment",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 213,
                    "activityId": "481b13c2-3672-4e80-afdf-cdc469a8da8d",
                    "createdAt": 1735217400853
                },
                {
                    "id": "6769b60676414f37209b0f20",
                    "timeLogged": 742,
                    "name": "Gym & Fitness Equipment",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 19,
                    "activityId": "faa75060-0045-4876-abd0-0c9246a4a1d1",
                    "createdAt": 1735224600971
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 7,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 0,
                    "activityId": "b774ecd1-8713-4f38-8c20-f0b5ecde25fc",
                    "createdAt": 1735227000466
                },
                {
                    "id": "6769b59176414f37209b0f1f",
                    "timeLogged": 781,
                    "name": "Cycling",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 7774,
                    "activityId": "e77f42e1-2976-4a11-bbb6-6803588eb405",
                    "createdAt": 1735227600206
                }
            ],
            "source": {
                "name": "garmin-connect",
                "id": "2e25b76e-be65-4cc9-abfe-4479bd1c31d3"
            },
            "calories": 1620.6889999999999,
            "caloriesBurnt": 8214
        },
        {
            "id": "676cf20921f4276cd9ea72a0",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "measurementDate": 1735151280000,
            "lastmodifiedDate": 1735193192826,
            "value": [
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 1628,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 67,
                    "activityId": "b7d2eb80-ca73-4e40-a0f8-72897fa7fe6f",
                    "createdAt": 1735193097636
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 1628,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 67,
                    "activityId": "6c7dc88d-fe81-461d-ad94-5dad10506319",
                    "createdAt": 1735193192826
                }
            ],
            "source": {
                "name": "garmin-connect",
                "id": "cdf51416-0150-45f9-8a4b-461775b6a284"
            },
            "calories": 1620.6889999999999,
            "caloriesBurnt": 134
        },
        {
            "id": "677e0b7eb2bc3b4015aa9496",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "measurementDate": 1733462400000,
            "lastmodifiedDate": 1733462400000,
            "value": [
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 2,
                    "name": "Walking",
                    "time": 50,
                    "calories": 262.5,
                    "caloriesBurnt": 78.75,
                    "activityId": "47668da3-907c-49ca-bbe6-9b94fa0ddf9d",
                    "createdAt": 1736313726291
                }
            ],
            "source": {
                "name": "restore-me",
                "id": "ee9c30c3-e8e6-4fbf-ab69-2db81bb0911d"
            },
            "calories": 1620.6889999999999,
            "caloriesBurnt": 78.75
        },
        {
            "id": "677b59f0e689e25090fdbb09",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "measurementDate": 1731058676000,
            "lastmodifiedDate": 1736154000221,
            "value": [
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 2,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 9,
                    "activityId": "9da26daf-1fb3-4405-b5f1-77a0c9e2163f",
                    "createdAt": 1736137200077
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 2,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 9,
                    "activityId": "b869e0bd-9086-4dd7-ae4d-307a70e7d6e5",
                    "createdAt": 1736137200078
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 2,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 9,
                    "activityId": "f677fbdd-1171-48cd-a242-745dadcadf0d",
                    "createdAt": 1736137800808
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 2,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 9,
                    "activityId": "43ffddf6-dd50-472c-8049-9757eee4dd12",
                    "createdAt": 1736138400556
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 2,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 9,
                    "activityId": "17672e73-32ea-4a4e-a86c-ac867a8198f6",
                    "createdAt": 1736138400557
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 2,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 9,
                    "activityId": "8037f918-b7e5-4050-b577-6141d20b5801",
                    "createdAt": 1736140200830
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 2,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 9,
                    "activityId": "3303fea6-fdc8-4869-9ffb-adcb62595186",
                    "createdAt": 1736142000109
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 2,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 9,
                    "activityId": "01767a5f-3d2e-40e6-801f-7eca3427acb2",
                    "createdAt": 1736142000109
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 2,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 9,
                    "activityId": "040ebf36-10ae-4091-a726-afac7ce538d7",
                    "createdAt": 1736142000110
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 2,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 9,
                    "activityId": "e55eb277-6aeb-4300-ad15-197ed15d9436",
                    "createdAt": 1736142000110
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 2,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 9,
                    "activityId": "efac504f-1abc-4cce-ab70-528b962a95d9",
                    "createdAt": 1736142000110
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 2,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 9,
                    "activityId": "2b08e8e2-b0c4-4405-9483-5dd7804beaa8",
                    "createdAt": 1736142600855
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 2,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 9,
                    "activityId": "e50c7c92-e4f6-454d-998f-5e61feb2f800",
                    "createdAt": 1736148600419
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 2,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 9,
                    "activityId": "850a42f7-6cbe-419d-95cf-3eac09725a61",
                    "createdAt": 1736152200956
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 2,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 9,
                    "activityId": "5f8e4c77-44ed-4828-83a3-fd764e751a5c",
                    "createdAt": 1736152200956
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 2,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 9,
                    "activityId": "3f75dd9d-68b8-4eb4-9a2d-a0e0cc6773e2",
                    "createdAt": 1736152200956
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 2,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 9,
                    "activityId": "de6c00fb-801b-4ce6-9929-76ba29cb1d72",
                    "createdAt": 1736152800715
                },
                {
                    "id": "6769b62176414f37209b0f21",
                    "timeLogged": 2,
                    "name": "Walking",
                    "time": 20,
                    "calories": 0,
                    "caloriesBurnt": 9,
                    "activityId": "6b30890d-23a3-460d-bbe5-d02f3a90c093",
                    "createdAt": 1736154000221
                }
            ],
            "source": {
                "name": "garmin-connect",
                "id": "e2ec823b-f72a-495c-9db5-2638c7ced36a"
            },
            "calories": 1620.6889999999999,
            "caloriesBurnt": 162
        }
    ],
    "benchMarks": {
        "lowBorderline": {
            "min": 648.2755999999999,
            "max": 1134.4823
        },
        "normal": {
            "min": 1134.4823,
            "max": 2106.8957
        },
        "highBorderline": {
            "min": 2106.8957,
            "max": 2593.1023999999998
        }
    }
}

const stepData = {
    "goalAverage": 500,
    "actualAverage": 464.2352941176471,
    "unit": "steps",
    "logs": [
        {
            "_id": "67caeda3e1280bb1ef716295",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 200,
            "goal": 500,
            "measurementDate": 1741352348000,
            "lastmodifiedDate": 1741352348000,
            "source": {
                "id": "8e26de7b-24f4-4506-acc9-1d714c4c089a",
                "name": "restore-me"
            },
            "createdAt": 1741352355372,
            "updatedAt": 1741352355372
        },
        {
            "_id": "67caed96e1280ba3e2716294",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 400,
            "goal": 500,
            "measurementDate": 1741352335000,
            "lastmodifiedDate": 1741352335000,
            "source": {
                "id": "1d544ed3-3ffd-4e13-a173-41d81c6222bb",
                "name": "restore-me"
            },
            "createdAt": 1741352342125,
            "updatedAt": 1741352342125
        },
        {
            "_id": "67caed75e1280b85b7716293",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 200,
            "goal": 500,
            "measurementDate": 1741352304000,
            "lastmodifiedDate": 1741352304000,
            "source": {
                "id": "02fa7293-5b12-47a7-9c52-f67eae576ba5",
                "name": "restore-me"
            },
            "createdAt": 1741352309756,
            "updatedAt": 1741352309756
        },
        {
            "_id": "67caeb56e1280b61fd716292",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 100,
            "goal": 500,
            "measurementDate": 1741351756000,
            "lastmodifiedDate": 1741351756000,
            "source": {
                "id": "3fa41726-2932-40db-9adf-702ebcaefc14",
                "name": "restore-me"
            },
            "createdAt": 1741351766405,
            "updatedAt": 1741351766405
        },
        {
            "_id": "67ca9ad815590866b5d55347",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2stepcount07mar2025",
                "name": "google-hc"
            },
            "createdAt": 1741332705615,
            "goal": 500,
            "lastmodifiedDate": 1741332705615,
            "measurementDate": 1741332705615,
            "type": "stepcount",
            "value": 3987
        },
        {
            "_id": "67ca661a15590866b5d367f7",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2stepcount7Mar2025",
                "name": "apple-hk"
            },
            "createdAt": 1741285800000,
            "goal": 500,
            "lastmodifiedDate": 1741285800000,
            "measurementDate": 1741285800000,
            "type": "stepcount",
            "value": 2121
        },
        {
            "_id": "67c98247e1280b794871627a",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 400,
            "goal": 500,
            "measurementDate": 1741259327000,
            "lastmodifiedDate": 1741259327000,
            "source": {
                "id": "e68f8a7e-1b5e-41d5-b4d5-eccb74271a53",
                "name": "restore-me"
            },
            "createdAt": 1741259335051,
            "updatedAt": 1741259335051
        },
        {
            "_id": "67c9883915590866b5cf7e51",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2stepcount6Mar2025",
                "name": "apple-hk"
            },
            "createdAt": 1741199400000,
            "goal": 500,
            "lastmodifiedDate": 1741199400000,
            "measurementDate": 1741199400000,
            "type": "stepcount",
            "value": 28
        },
        {
            "_id": "67c7bf8915590866b5c021c5",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2stepcount5Mar2025"
            },
            "createdAt": 1741113000000,
            "goal": 500,
            "lastmodifiedDate": 1741113000000,
            "measurementDate": 1741113000000,
            "type": "stepcount",
            "value": 4272
        },
        {
            "_id": "67c7388fe1280b6cba716211",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 5,
            "goal": 500,
            "measurementDate": 1741109379000,
            "lastmodifiedDate": 1741109379000,
            "source": {
                "id": "719bfb4a-4073-45a3-99cb-8fcec375f7b7",
                "name": "restore-me"
            },
            "createdAt": 1741109391299,
            "updatedAt": 1741109391299
        },
        {
            "_id": "67c6793ae1280b77797161f6",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 1000,
            "goal": 500,
            "measurementDate": 1741060380000,
            "lastmodifiedDate": 1741060380000,
            "source": {
                "id": "5d4589e4-7473-4dbe-b279-b4b5267d6940",
                "name": "restore-me"
            },
            "createdAt": 1741060410541,
            "updatedAt": 1741060410541
        },
        {
            "_id": "67c5b6385fa6f51222cbbded",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 500,
            "goal": 500,
            "measurementDate": 1741010460000,
            "lastmodifiedDate": 1741010460000,
            "source": {
                "id": "a520e95a-f57e-4044-a41d-51dbd101262b",
                "name": "restore-me"
            },
            "createdAt": 1741010488679,
            "updatedAt": 1741010488679
        },
        {
            "_id": "67c5b3c55fa6f553b6cbbdec",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 500,
            "goal": 500,
            "measurementDate": 1741009800000,
            "lastmodifiedDate": 1741009800000,
            "source": {
                "id": "41e25168-18c1-4cde-a06c-55938377effd",
                "name": "restore-me"
            },
            "createdAt": 1741009861766,
            "updatedAt": 1741009861766
        },
        {
            "_id": "67c5afe45fa6f5f35dcbbdeb",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 1000,
            "goal": 500,
            "measurementDate": 1741008840000,
            "lastmodifiedDate": 1741008840000,
            "source": {
                "id": "92de854f-e509-4f36-bc39-f435b2995255",
                "name": "restore-me"
            },
            "createdAt": 1741008868067,
            "updatedAt": 1741008868067
        },
        {
            "_id": "67c597c05fa6f50cf6cbbde9",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 500,
            "goal": 500,
            "measurementDate": 1741002660000,
            "lastmodifiedDate": 1741002660000,
            "source": {
                "id": "d71d3b94-b2aa-49d2-912e-5e33cce38a96",
                "name": "restore-me"
            },
            "createdAt": 1741002688581,
            "updatedAt": 1741002688581
        },
        {
            "_id": "67c597ce5fa6f594bdcbbdea",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 600,
            "goal": 500,
            "measurementDate": 1741002660000,
            "lastmodifiedDate": 1741002660000,
            "source": {
                "id": "6c355689-71d9-4538-b8eb-39ffd7bc090f",
                "name": "restore-me"
            },
            "createdAt": 1741002702685,
            "updatedAt": 1741002702685
        },
        {
            "_id": "67c559a713c06aa22289c068",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2stepcount3Mar2025",
                "name": "apple-hk"
            },
            "createdAt": 1740940200000,
            "goal": 500,
            "lastmodifiedDate": 1740940200000,
            "measurementDate": 1740940200000,
            "type": "stepcount",
            "value": 5708.424871627288
        },
        {
            "_id": "67ca9ad815590866b5d55346",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2stepcount02mar2025",
                "name": "google-hc"
            },
            "createdAt": 1740940199999,
            "goal": 500,
            "lastmodifiedDate": 1740940199999,
            "measurementDate": 1740940199999,
            "type": "stepcount",
            "value": 47251
        },
        {
            "_id": "67c507ee13c06aa22286551e",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2stepcount2Mar2025",
                "name": "apple-hk"
            },
            "createdAt": 1740853800000,
            "goal": 500,
            "lastmodifiedDate": 1740853800000,
            "measurementDate": 1740853800000,
            "type": "stepcount",
            "value": 35
        },
        {
            "_id": "67c5706d5fa6f5a8f6cbbda8",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 240,
            "goal": 10000,
            "measurementDate": 1740819808000,
            "lastmodifiedDate": 1740819808000,
            "source": {
                "id": "29f3886d-0dc6-4164-a922-f7fc70015120",
                "name": "restore-me"
            },
            "createdAt": 1740992621264,
            "updatedAt": 1740992621264
        },
        {
            "_id": "67c3c9a5393706c3602b3fb3",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2stepcount1Mar2025"
            },
            "createdAt": 1740767400000,
            "goal": 500,
            "lastmodifiedDate": 1740767400000,
            "measurementDate": 1740767400000,
            "type": "stepcount",
            "value": 142
        },
        {
            "_id": "67c170e5b4a0e5477676ed89",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2stepcount28Feb2025"
            },
            "createdAt": 1740681000000,
            "goal": 500,
            "lastmodifiedDate": 1740681000000,
            "measurementDate": 1740681000000,
            "type": "stepcount",
            "value": 3116
        },
        {
            "_id": "67bfd7a9b4a0e547765e2bac",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2stepcount27Feb2025",
                "name": "apple-hk"
            },
            "createdAt": 1740594600000,
            "goal": 500,
            "lastmodifiedDate": 1740594600000,
            "measurementDate": 1740594600000,
            "type": "stepcount",
            "value": 3825
        },
        {
            "_id": "67bed3550321c09c78cf7cac",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2stepcount26Feb2025",
                "name": "apple-hk"
            },
            "createdAt": 1740508200000,
            "goal": 500,
            "lastmodifiedDate": 1740508200000,
            "measurementDate": 1740508200000,
            "type": "stepcount",
            "value": 19
        },
        {
            "_id": "67bdd6b40321c09c78c5e016",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2stepcount25Feb2025"
            },
            "createdAt": 1740421800000,
            "goal": 500,
            "lastmodifiedDate": 1740421800000,
            "measurementDate": 1740421800000,
            "type": "stepcount",
            "value": 59
        },
        {
            "_id": "67bc06bdc82c960e9c1b9025",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2stepcount24Feb2025",
                "name": "apple-hk"
            },
            "createdAt": 1740335400000,
            "goal": 500,
            "lastmodifiedDate": 1740335400000,
            "measurementDate": 1740335400000,
            "type": "stepcount",
            "value": 2934
        },
        {
            "_id": "67bc06bdc82c960e9c1b9024",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2stepcount23Feb2025",
                "name": "apple-hk"
            },
            "createdAt": 1740249000000,
            "goal": 500,
            "lastmodifiedDate": 1740249000000,
            "measurementDate": 1740249000000,
            "type": "stepcount",
            "value": 136
        },
        {
            "_id": "67bc06bdc82c960e9c1b9022",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2stepcount22Feb2025",
                "name": "apple-hk"
            },
            "createdAt": 1740162600000,
            "goal": 500,
            "lastmodifiedDate": 1740162600000,
            "measurementDate": 1740162600000,
            "type": "stepcount",
            "value": 814
        },
        {
            "_id": "67b7fe48c82c960e9c086811",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2stepcount21Feb2025"
            },
            "createdAt": 1740076200000,
            "goal": 500,
            "lastmodifiedDate": 1740076200000,
            "measurementDate": 1740076200000,
            "type": "stepcount",
            "value": 3632.198131095547
        },
        {
            "_id": "67ca9ad815590866b5d55345",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2stepcount20feb2025",
                "name": "google-hc"
            },
            "createdAt": 1740076199999,
            "goal": 500,
            "lastmodifiedDate": 1740076199999,
            "measurementDate": 1740076199999,
            "type": "stepcount",
            "value": 41276
        },
        {
            "_id": "67b6febffbbb5282f223acbd",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 111,
            "goal": 1,
            "measurementDate": 1740046006000,
            "lastmodifiedDate": 1740046006000,
            "source": {
                "id": "de6a7771-c1e8-4fe2-aa55-086dd68d7b4a",
                "name": "restore-me"
            },
            "createdAt": 1740046015580,
            "updatedAt": 1740046015580
        },
        {
            "_id": "67b6f183fbbb5266ff23acbb",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 59,
            "goal": 1,
            "measurementDate": 1740042621000,
            "lastmodifiedDate": 1740042621000,
            "source": {
                "id": "683e1385-95d5-4126-9cb8-a61cd9c37abb",
                "name": "restore-me"
            },
            "createdAt": 1740042627593,
            "updatedAt": 1740042627593
        },
        {
            "_id": "67b6f07cc82c960e9c0221eb",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2stepcount20Feb2025",
                "name": "apple-hk"
            },
            "createdAt": 1739989800000,
            "goal": 500,
            "lastmodifiedDate": 1739989800000,
            "measurementDate": 1739989800000,
            "type": "stepcount",
            "value": 5121
        },
        {
            "_id": "67b56802fbf942d14b9ea57e",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 222,
            "goal": 1,
            "measurementDate": 1739941884000,
            "lastmodifiedDate": 1739941884000,
            "source": {
                "id": "3a4c1077-b41f-459a-af9d-59e3dff49d61",
                "name": "restore-me"
            },
            "createdAt": 1739941890862,
            "updatedAt": 1739941890862
        },
        {
            "_id": "67b567f2fbf942acc19ea57d",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 200,
            "goal": 1,
            "measurementDate": 1739941850000,
            "lastmodifiedDate": 1739941850000,
            "source": {
                "id": "de432eee-9cb5-4d98-bfca-877107ec2560",
                "name": "restore-me"
            },
            "createdAt": 1739941874487,
            "updatedAt": 1739941874487
        },
        {
            "_id": "67b56611fbf9423d269ea57c",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 100,
            "goal": 1,
            "measurementDate": 1739941380000,
            "lastmodifiedDate": 1739941380000,
            "source": {
                "id": "7003d0b7-933d-4c7e-9626-8a1d2b77de11",
                "name": "restore-me"
            },
            "createdAt": 1739941393891,
            "updatedAt": 1739941393891
        },
        {
            "_id": "67b564e7fbf9427ba99ea577",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 222,
            "goal": 1,
            "measurementDate": 1739941088000,
            "lastmodifiedDate": 1739941088000,
            "source": {
                "id": "56f039c3-da9b-45a7-bc70-77e6415ead6b",
                "name": "restore-me"
            },
            "createdAt": 1739941095085,
            "updatedAt": 1739941095085
        },
        {
            "_id": "67b55f99fbf94235549ea56f",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 999,
            "goal": 1,
            "measurementDate": 1739939733000,
            "lastmodifiedDate": 1739939733000,
            "source": {
                "id": "a1033e61-e8d9-4ce0-aec5-258e2a70a7b2",
                "name": "restore-me"
            },
            "createdAt": 1739939737386,
            "updatedAt": 1739939737386
        },
        {
            "_id": "67b5612336040ac59f944af2",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2stepcount19Feb2025"
            },
            "createdAt": 1739903400000,
            "goal": 500,
            "lastmodifiedDate": 1739903400000,
            "measurementDate": 1739903400000,
            "type": "stepcount",
            "value": 3143
        },
        {
            "_id": "67b86010c82c960e9c10a2e8",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2stepcount18Feb2025"
            },
            "createdAt": 1739817000000,
            "goal": 500,
            "lastmodifiedDate": 1739817000000,
            "measurementDate": 1739817000000,
            "type": "stepcount",
            "value": 42
        },
        {
            "_id": "67b86010c82c960e9c10a2ed",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2stepcount17Feb2025",
                "name": "apple-hk"
            },
            "createdAt": 1739730600000,
            "goal": 500,
            "lastmodifiedDate": 1739730600000,
            "measurementDate": 1739730600000,
            "type": "stepcount",
            "value": 3332
        },
        {
            "_id": "67b86010c82c960e9c10a2f0",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2stepcount16Feb2025"
            },
            "createdAt": 1739644200000,
            "goal": 500,
            "lastmodifiedDate": 1739644200000,
            "measurementDate": 1739644200000,
            "type": "stepcount",
            "value": 23
        },
        {
            "_id": "67b86010c82c960e9c10a2ec",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2stepcount15Feb2025"
            },
            "createdAt": 1739557800000,
            "goal": 500,
            "lastmodifiedDate": 1739557800000,
            "measurementDate": 1739557800000,
            "type": "stepcount",
            "value": 53
        },
        {
            "_id": "67aee8ba49441e8a56951b00",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2stepcount14Feb2025"
            },
            "createdAt": 1739471400000,
            "goal": 500,
            "lastmodifiedDate": 1739471400000,
            "measurementDate": 1739471400000,
            "type": "stepcount",
            "value": 3732
        },
        {
            "_id": "67ad844a401feb8d655f14fd",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 3,
            "goal": 1,
            "measurementDate": 1739424780000,
            "lastmodifiedDate": 1739424780000,
            "source": {
                "id": "cd9abbbe-324a-45ed-9186-6d90259cc227",
                "name": "restore-me"
            },
            "createdAt": 1739424842430,
            "updatedAt": 1739424842430
        },
        {
            "_id": "67ad825d401feb2ec05f14fa",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 33,
            "goal": 1,
            "measurementDate": 1739424300000,
            "lastmodifiedDate": 1739424300000,
            "source": {
                "id": "7fdf3230-1fe9-4e50-87ec-be4b30f64faa",
                "name": "restore-me"
            },
            "createdAt": 1739424349465,
            "updatedAt": 1739424349465
        },
        {
            "_id": "67ada98149441e8a568d8751",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2stepcount13Feb2025"
            },
            "createdAt": 1739385000000,
            "goal": 500,
            "lastmodifiedDate": 1739385000000,
            "measurementDate": 1739385000000,
            "type": "stepcount",
            "value": 27
        },
        {
            "_id": "67ac260749441e8a567e9d33",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2stepcount12Feb2025"
            },
            "createdAt": 1739298600000,
            "goal": 500,
            "lastmodifiedDate": 1739298600000,
            "measurementDate": 1739298600000,
            "type": "stepcount",
            "value": 3042
        },
        {
            "_id": "67aa793849441e8a5671e6d8",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2-garmin-connect-2025-02-11",
                "name": "garmin-connect"
            },
            "goal": 7500,
            "lastmodifiedDate": 1739212200000,
            "measurementDate": 1739212200000,
            "type": "stepcount",
            "value": 0
        },
        {
            "_id": "67aaec2549441e8a5674c9fb",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2stepcount11Feb2025"
            },
            "createdAt": 1739212200000,
            "goal": 500,
            "lastmodifiedDate": 1739212200000,
            "measurementDate": 1739212200000,
            "type": "stepcount",
            "value": 44
        },
        {
            "_id": "67ca9ad815590866b5d55344",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2stepcount10feb2025",
                "name": "google-hc"
            },
            "createdAt": 1739212199999,
            "goal": 500,
            "lastmodifiedDate": 1739212199999,
            "measurementDate": 1739212199999,
            "type": "stepcount",
            "value": 27579
        },
        {
            "_id": "67a9256049441e8a5668766b",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2-garmin-connect-2025-02-10",
                "name": "garmin-connect"
            },
            "goal": 7500,
            "lastmodifiedDate": 1739125800000,
            "measurementDate": 1739125800000,
            "type": "stepcount",
            "value": 272
        },
        {
            "_id": "67a9720b49441e8a566914f8",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2stepcount10Feb2025",
                "name": "apple-hk"
            },
            "createdAt": 1739125800000,
            "goal": 500,
            "lastmodifiedDate": 1739125800000,
            "measurementDate": 1739125800000,
            "type": "stepcount",
            "value": 3103
        },
        {
            "_id": "67a83b0049441e8a56668182",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2-garmin-connect-2025-02-09",
                "name": "garmin-connect"
            },
            "goal": 7500,
            "lastmodifiedDate": 1739039400000,
            "measurementDate": 1739039400000,
            "type": "stepcount",
            "value": 484
        },
        {
            "_id": "67a855be49441e8a5666be1e",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2stepcount9Feb2025"
            },
            "createdAt": 1739039400000,
            "goal": 500,
            "lastmodifiedDate": 1739039400000,
            "measurementDate": 1739039400000,
            "type": "stepcount",
            "value": 42
        },
        {
            "_id": "67a855be49441e8a5666be1a",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2stepcount8Feb2025"
            },
            "createdAt": 1738953000000,
            "goal": 500,
            "lastmodifiedDate": 1738953000000,
            "measurementDate": 1738953000000,
            "type": "stepcount",
            "value": 18
        },
        {
            "_id": "67a5e6bc31d90d75a4d408ef",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 10,
            "goal": 0,
            "measurementDate": 1738925727000,
            "lastmodifiedDate": 1738925727000,
            "source": {
                "id": "c8cc0863-892c-417c-bbd3-05b204b8688a",
                "name": "restore-me"
            },
            "createdAt": 1738925756652,
            "updatedAt": 1738925756652
        },
        {
            "_id": "67a5e56e31d90dbf32d408e3",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 600,
            "goal": 0,
            "measurementDate": 1738925416000,
            "lastmodifiedDate": 1738925416000,
            "source": {
                "id": "4a61865a-11ed-4582-b565-4a108a051ff6",
                "name": "restore-me"
            },
            "createdAt": 1738925422717,
            "updatedAt": 1738925422717
        },
        {
            "_id": "67a5d32e49441e8a565c7e51",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2stepcount7Feb2025"
            },
            "createdAt": 1738866600000,
            "goal": 500,
            "lastmodifiedDate": 1738866600000,
            "measurementDate": 1738866600000,
            "type": "stepcount",
            "value": 3434
        },
        {
            "_id": "67b86010c82c960e9c10a2e9",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2stepcount6Feb2025",
                "name": "apple-hk"
            },
            "createdAt": 1738780200000,
            "goal": 500,
            "lastmodifiedDate": 1738780200000,
            "measurementDate": 1738780200000,
            "type": "stepcount",
            "value": 3196
        },
        {
            "_id": "67b86010c82c960e9c10a2f7",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2stepcount5Feb2025",
                "name": "apple-hk"
            },
            "createdAt": 1738693800000,
            "goal": 500,
            "lastmodifiedDate": 1738693800000,
            "measurementDate": 1738693800000,
            "type": "stepcount",
            "value": 33
        },
        {
            "_id": "67b86010c82c960e9c10a2ee",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2stepcount4Feb2025",
                "name": "apple-hk"
            },
            "createdAt": 1738607400000,
            "goal": 500,
            "lastmodifiedDate": 1738607400000,
            "measurementDate": 1738607400000,
            "type": "stepcount",
            "value": 3543
        },
        {
            "_id": "67b86010c82c960e9c10a2ef",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2stepcount3Feb2025"
            },
            "createdAt": 1738521000000,
            "goal": 500,
            "lastmodifiedDate": 1738521000000,
            "measurementDate": 1738521000000,
            "type": "stepcount",
            "value": 20
        },
        {
            "_id": "67b86010c82c960e9c10a2f6",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2stepcount2Feb2025",
                "name": "apple-hk"
            },
            "createdAt": 1738434600000,
            "goal": 10000,
            "lastmodifiedDate": 1738434600000,
            "measurementDate": 1738434600000,
            "type": "stepcount",
            "value": 55
        },
        {
            "_id": "67b86010c82c960e9c10a2ea",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2stepcount1Feb2025"
            },
            "createdAt": 1738348200000,
            "goal": 10000,
            "lastmodifiedDate": 1738348200000,
            "measurementDate": 1738348200000,
            "type": "stepcount",
            "value": 32
        },
        {
            "_id": "67b86010c82c960e9c10a2e7",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2stepcount31Jan2025"
            },
            "createdAt": 1738261800000,
            "goal": 10000,
            "lastmodifiedDate": 1738261800000,
            "measurementDate": 1738261800000,
            "type": "stepcount",
            "value": 4193
        },
        {
            "_id": "67b86010c82c960e9c10a2f8",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2stepcount30Jan2025",
                "name": "apple-hk"
            },
            "createdAt": 1738175400000,
            "goal": 10000,
            "lastmodifiedDate": 1738175400000,
            "measurementDate": 1738175400000,
            "type": "stepcount",
            "value": 97
        },
        {
            "_id": "67b86010c82c960e9c10a2f4",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2stepcount29Jan2025"
            },
            "createdAt": 1738089000000,
            "goal": 10000,
            "lastmodifiedDate": 1738089000000,
            "measurementDate": 1738089000000,
            "type": "stepcount",
            "value": 20
        },
        {
            "_id": "67b86010c82c960e9c10a2f5",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2stepcount28Jan2025",
                "name": "apple-hk"
            },
            "createdAt": 1738002600000,
            "goal": 10000,
            "lastmodifiedDate": 1738002600000,
            "measurementDate": 1738002600000,
            "type": "stepcount",
            "value": 34
        },
        {
            "_id": "67b86010c82c960e9c10a2fa",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2stepcount27Jan2025",
                "name": "apple-hk"
            },
            "createdAt": 1737916200000,
            "goal": 10000,
            "lastmodifiedDate": 1737916200000,
            "measurementDate": 1737916200000,
            "type": "stepcount",
            "value": 34
        },
        {
            "_id": "67b86010c82c960e9c10a2f3",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2stepcount26Jan2025",
                "name": "apple-hk"
            },
            "createdAt": 1737829800000,
            "goal": 1,
            "lastmodifiedDate": 1737829800000,
            "measurementDate": 1737829800000,
            "type": "stepcount",
            "value": 83
        },
        {
            "_id": "67b86010c82c960e9c10a2e6",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2stepcount24Jan2025"
            },
            "createdAt": 1737657000000,
            "goal": 1,
            "lastmodifiedDate": 1737657000000,
            "measurementDate": 1737657000000,
            "type": "stepcount",
            "value": 2987
        },
        {
            "_id": "67b86010c82c960e9c10a2f9",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2stepcount23Jan2025",
                "name": "apple-hk"
            },
            "createdAt": 1737570600000,
            "goal": 1,
            "lastmodifiedDate": 1737570600000,
            "measurementDate": 1737570600000,
            "type": "stepcount",
            "value": 34
        },
        {
            "_id": "67b86010c82c960e9c10a2f2",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "name": "apple-hk",
                "id": "6723041b7ee984705f6bfbe2stepcount22Jan2025"
            },
            "createdAt": 1737484200000,
            "goal": 1,
            "lastmodifiedDate": 1737484200000,
            "measurementDate": 1737484200000,
            "type": "stepcount",
            "value": 52
        },
        {
            "_id": "6788c040111bce331150ebab",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 200,
            "goal": 0,
            "measurementDate": 1737015352000,
            "lastmodifiedDate": 1737015352000,
            "source": {
                "id": "ae8704d5-5290-4124-b350-d7d3455b1eb1",
                "name": "restore-me"
            },
            "createdAt": 1737015360238,
            "updatedAt": 1737015360238
        },
        {
            "_id": "6788c018111bce4e9b50ebaa",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 200,
            "goal": 0,
            "measurementDate": 1737015313000,
            "lastmodifiedDate": 1737015313000,
            "source": {
                "id": "f41dd61b-a49d-41b1-b074-f437db17c176",
                "name": "restore-me"
            },
            "createdAt": 1737015320517,
            "updatedAt": 1737015320517
        },
        {
            "_id": "6788bf0b111bcee61150eba9",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 66,
            "goal": 0,
            "measurementDate": 1737015033000,
            "lastmodifiedDate": 1737015033000,
            "source": {
                "id": "41893a9f-083c-4c01-9b43-8337798ed8c9",
                "name": "restore-me"
            },
            "createdAt": 1737015051101,
            "updatedAt": 1737015051101
        },
        {
            "_id": "6788b57fbd58bcb5b73851e9",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 30,
            "goal": 0,
            "measurementDate": 1737012596000,
            "lastmodifiedDate": 1737012596000,
            "source": {
                "id": "49f1ea54-6754-4a31-a388-d058a4bb33f8",
                "name": "restore-me"
            },
            "createdAt": 1737012607055,
            "updatedAt": 1737012607055
        },
        {
            "_id": "6788b51bbd58bc691c3851e8",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 20,
            "goal": 0,
            "measurementDate": 1737012496000,
            "lastmodifiedDate": 1737012496000,
            "source": {
                "id": "0c4f03e0-6a7c-4c2f-8892-e227c0354de0",
                "name": "restore-me"
            },
            "createdAt": 1737012507476,
            "updatedAt": 1737012507476
        },
        {
            "_id": "6788ae2dbd58bc251f3851e4",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 55,
            "goal": 0,
            "measurementDate": 1737010725000,
            "lastmodifiedDate": 1737010725000,
            "source": {
                "id": "f24923fe-e0d3-48b9-ba07-1f2178621de1",
                "name": "restore-me"
            },
            "createdAt": 1737010733854,
            "updatedAt": 1737010733854
        },
        {
            "_id": "6788ad1ebd58bc8dd13851e3",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 100,
            "goal": 0,
            "measurementDate": 1737010456000,
            "lastmodifiedDate": 1737010456000,
            "source": {
                "id": "ed0c2ed0-f8d7-40f1-9be7-5b554666542d",
                "name": "restore-me"
            },
            "createdAt": 1737010462173,
            "updatedAt": 1737010462173
        },
        {
            "_id": "6788ab2abd58bc5a103851e2",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 22,
            "goal": 0,
            "measurementDate": 1737009937000,
            "lastmodifiedDate": 1737009937000,
            "source": {
                "id": "41a89d25-2704-4547-8602-df65384aea77",
                "name": "restore-me"
            },
            "createdAt": 1737009962861,
            "updatedAt": 1737009962861
        },
        {
            "_id": "6788921cbd58bc534a3851df",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 35,
            "goal": 0,
            "measurementDate": 1737003538000,
            "lastmodifiedDate": 1737003538000,
            "source": {
                "id": "7a5f4688-2991-4d19-b2dc-c9d9d04a99f6",
                "name": "restore-me"
            },
            "createdAt": 1737003548482,
            "updatedAt": 1737003548482
        },
        {
            "_id": "678891eabd58bcd2de3851dc",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 25,
            "goal": 0,
            "measurementDate": 1737003491000,
            "lastmodifiedDate": 1737003491000,
            "source": {
                "id": "445af3ee-19f0-4b1a-8a7b-e11c1d97a3ee",
                "name": "restore-me"
            },
            "createdAt": 1737003498555,
            "updatedAt": 1737003498555
        },
        {
            "_id": "678891c6bd58bcbdba3851d9",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 12,
            "goal": 0,
            "measurementDate": 1737003408000,
            "lastmodifiedDate": 1737003408000,
            "source": {
                "id": "7d85e6ee-4ad9-4a6d-8daf-1daf3f4313b9",
                "name": "restore-me"
            },
            "createdAt": 1737003462977,
            "updatedAt": 1737003462977
        },
        {
            "_id": "67888fb5bd58bcbd493851cc",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 50,
            "goal": 0,
            "measurementDate": 1737002880000,
            "lastmodifiedDate": 1737002880000,
            "source": {
                "id": "3cf01af7-ae2d-477c-a07b-ccf744983b7c",
                "name": "restore-me"
            },
            "createdAt": 1737002933537,
            "updatedAt": 1737002933537
        },
        {
            "_id": "677c225ec1d5c07b73d4e4dd",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 999,
            "goal": 0,
            "measurementDate": 1736188505000,
            "lastmodifiedDate": 1736188505000,
            "source": {
                "id": "0f1b5dbf-9464-4cb8-85f3-252e5970ded4",
                "name": "restore-me"
            },
            "createdAt": 1736188510358,
            "updatedAt": 1736188510358
        },
        {
            "_id": "67a4356a003e6c1f47db8026",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 500,
            "goal": 0,
            "measurementDate": 1736136416000,
            "lastmodifiedDate": 1736136416000,
            "source": {
                "id": "96c47620-823d-413b-920d-e918c0adb9c6",
                "name": "restore-me"
            },
            "createdAt": 1738814826886,
            "updatedAt": 1738814826886
        },
        {
            "_id": "677b9de9e689e2509001254d",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2-garmin-connect-2025-01-06",
                "name": "garmin-connect"
            },
            "goal": 1000,
            "lastmodifiedDate": 1736121600000,
            "measurementDate": 1736121600000,
            "type": "stepcount",
            "value": 1861
        },
        {
            "_id": "677b9de9e689e2509001254a",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2-garmin-connect-2025-01-05",
                "name": "garmin-connect"
            },
            "goal": 1010,
            "lastmodifiedDate": 1736035200000,
            "measurementDate": 1736035200000,
            "type": "stepcount",
            "value": 319
        },
        {
            "_id": "677b9de9e689e25090012549",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2-garmin-connect-2025-01-04",
                "name": "garmin-connect"
            },
            "goal": 1010,
            "lastmodifiedDate": 1735948800000,
            "measurementDate": 1735948800000,
            "type": "stepcount",
            "value": 0
        },
        {
            "_id": "6777ae47d8659d1a413fff2f",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 50,
            "goal": 0,
            "measurementDate": 1735896640000,
            "lastmodifiedDate": 1735896640000,
            "source": {
                "id": "8010a9c1-ff53-4a26-ae33-12ff186db1c8",
                "name": "restore-me"
            },
            "createdAt": 1735896647090,
            "updatedAt": 1735896647090
        },
        {
            "_id": "6777ae33d8659d7d8f3fff2e",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 5,
            "goal": 0,
            "measurementDate": 1735896619000,
            "lastmodifiedDate": 1735896619000,
            "source": {
                "id": "f9daa6ae-8b4d-433f-b3c5-b70357153eaf",
                "name": "restore-me"
            },
            "createdAt": 1735896627523,
            "updatedAt": 1735896627523
        },
        {
            "_id": "6777acf0d8659d52363fff2d",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 10,
            "goal": 0,
            "measurementDate": 1735896295000,
            "lastmodifiedDate": 1735896295000,
            "source": {
                "id": "776a7be4-e69c-493a-8f52-0b52d4cf6349",
                "name": "restore-me"
            },
            "createdAt": 1735896304599,
            "updatedAt": 1735896304599
        },
        {
            "_id": "6777a4b2d8659dcdb73fff2c",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 5,
            "goal": 0,
            "measurementDate": 1735894185000,
            "lastmodifiedDate": 1735894185000,
            "source": {
                "id": "74ee1d3b-17e5-4440-b407-8101c19937b8",
                "name": "restore-me"
            },
            "createdAt": 1735894194605,
            "updatedAt": 1735894194605
        },
        {
            "_id": "677b9de9e689e2509001254c",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2-garmin-connect-2025-01-03",
                "name": "garmin-connect"
            },
            "goal": 1010,
            "lastmodifiedDate": 1735862400000,
            "measurementDate": 1735862400000,
            "type": "stepcount",
            "value": 0
        },
        {
            "_id": "677682c772d5f211f61bf183",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 77,
            "goal": 0,
            "measurementDate": 1735819970000,
            "lastmodifiedDate": 1735819970000,
            "source": {
                "id": "ea06e76c-151e-4a88-854f-587fff0bb2cd",
                "name": "restore-me"
            },
            "createdAt": 1735819975034,
            "updatedAt": 1735819975034
        },
        {
            "_id": "677b9de9e689e25090012548",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2-garmin-connect-2025-01-02",
                "name": "garmin-connect"
            },
            "goal": 1010,
            "lastmodifiedDate": 1735776000000,
            "measurementDate": 1735776000000,
            "type": "stepcount",
            "value": 0
        },
        {
            "_id": "677b9de9e689e2509001254b",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2-garmin-connect-2024-12-31",
                "name": "garmin-connect"
            },
            "goal": 1010,
            "lastmodifiedDate": 1735603200000,
            "measurementDate": 1735603200000,
            "type": "stepcount",
            "value": 0
        },
        {
            "_id": "677b9de9e689e25090012547",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2-garmin-connect-2024-12-30",
                "name": "garmin-connect"
            },
            "goal": 1010,
            "lastmodifiedDate": 1735516800000,
            "measurementDate": 1735516800000,
            "type": "stepcount",
            "value": 0
        },
        {
            "_id": "677b9de9e689e2509001254e",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2-garmin-connect-2024-12-29",
                "name": "garmin-connect"
            },
            "goal": 1000,
            "lastmodifiedDate": 1735430400000,
            "measurementDate": 1735430400000,
            "type": "stepcount",
            "value": 1018
        },
        {
            "_id": "676efde0ba998f89cbc55010",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2-garmin-connect-2024-12-28",
                "name": "garmin-connect"
            },
            "goal": 1000,
            "lastmodifiedDate": 1735344000000,
            "measurementDate": 1735344000000,
            "type": "stepcount",
            "value": 60
        },
        {
            "_id": "676db818ba998f89cbc2a69e",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2-garmin-connect-2024-12-27",
                "name": "garmin-connect"
            },
            "goal": 1000,
            "lastmodifiedDate": 1735257600000,
            "measurementDate": 1735257600000,
            "type": "stepcount",
            "value": 738
        },
        {
            "_id": "676ce2d021f4276cd9ea4da8",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2-garmin-connect-2024-12-26",
                "name": "garmin-connect"
            },
            "goal": 1000,
            "lastmodifiedDate": 1735171200000,
            "measurementDate": 1735171200000,
            "type": "stepcount",
            "value": 846
        },
        {
            "_id": "676b915021f4276cd9e78cf1",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2-garmin-connect-2024-12-25",
                "name": "garmin-connect"
            },
            "goal": 1000,
            "lastmodifiedDate": 1735084800000,
            "measurementDate": 1735084800000,
            "type": "stepcount",
            "value": 995
        },
        {
            "_id": "676ab8cace088951ddcfe68b",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 80,
            "goal": 0,
            "measurementDate": 1735047365000,
            "lastmodifiedDate": 1735047365000,
            "source": {
                "id": "1df3be0f-658c-47c6-af17-9cb31c25391d",
                "name": "restore-me"
            },
            "createdAt": 1735047370359,
            "updatedAt": 1735047370359
        },
        {
            "_id": "676a81701f47c35fb42ad022",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2-garmin-connect-2024-12-24",
                "name": "garmin-connect"
            },
            "goal": 1000,
            "lastmodifiedDate": 1734998400000,
            "measurementDate": 1734998400000,
            "type": "stepcount",
            "value": 819
        },
        {
            "_id": "676979927e8b557770343a56",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 39,
            "goal": 0,
            "measurementDate": 1734965640000,
            "lastmodifiedDate": 1734965640000,
            "source": {
                "id": "0aa7112d-7003-493d-bde3-6e3f1bfe8a91",
                "name": "restore-me"
            },
            "createdAt": 1734965650528,
            "updatedAt": 1734965650528
        },
        {
            "_id": "676979c37e8b55adee343a57",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 500,
            "goal": 0,
            "measurementDate": 1734965640000,
            "lastmodifiedDate": 1734965640000,
            "source": {
                "id": "b7719dd9-2c0b-40aa-9758-4fc81f8fde24",
                "name": "restore-me"
            },
            "createdAt": 1734965699583,
            "updatedAt": 1734965699583
        },
        {
            "_id": "676979747e8b553364343a55",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "type": "stepcount",
            "value": 66,
            "goal": 0,
            "measurementDate": 1734965580000,
            "lastmodifiedDate": 1734965580000,
            "source": {
                "id": "ba018798-ead1-47d9-af02-1880e9c2762d",
                "name": "restore-me"
            },
            "createdAt": 1734965620162,
            "updatedAt": 1734965620162
        },
        {
            "_id": "67697164a01919facd5d71bc",
            "medicalProfileId": "6723041b7ee984705f6bfbe2",
            "source": {
                "id": "6723041b7ee984705f6bfbe2-garmin-connect-2024-12-22",
                "name": "garmin-connect"
            },
            "goal": 1000,
            "lastmodifiedDate": 1734825600000,
            "measurementDate": 1734825600000,
            "type": "stepcount",
            "value": 480
        }
    ],
    "benchMarks": {
        "lowBorderline": {
            "min": 250,
            "max": 400
        },
        "normal": {
            "min": 400,
            "max": 700
        },
        "highBorderline": {
            "min": 700,
            "max": 800
        }
    }
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
    weightData,
    activityData,
    stepData,
    120
);

