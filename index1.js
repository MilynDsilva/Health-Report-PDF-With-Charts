import PDFDocument from "pdfkit";
import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import moment from "moment-timezone";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set timezone (change 'Asia/Kolkata' to 'UTC' if needed)
const TIMEZONE = "Asia/Kolkata";

// Configure chart renderer
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width: 800, height: 400 });

function filterDataByTimeframe(data, timeframeDays) {
    const now = moment().tz(TIMEZONE).valueOf();
    const startDate = now - timeframeDays * 24 * 60 * 60 * 1000;
    return data.filter(d => d.measurementDate >= startDate);
}

function generateDateLabels(timeframeDays) {
    const now = moment().tz(TIMEZONE);
    let dates = [];
    for (let i = timeframeDays; i >= 0; i--) {
        let date = moment().tz(TIMEZONE).subtract(i, 'days');
        dates.push(date.format("DD MMM YYYY"));
    }
    return dates;
}

async function generateTemperatureChart(data, benchmark, timeframeDays) {
    const filteredData = filterDataByTimeframe(data, timeframeDays);
    const normalMin = benchmark.normalRange.min;
    const normalMax = benchmark.normalRange.max;
    const baseline = benchmark.baseline;

    const labels = generateDateLabels(timeframeDays);
    const dataMap = new Map(filteredData.map(d => [moment(d.measurementDate).tz(TIMEZONE).format("DD MMM YYYY"), d.value]));

    const values = labels.map(label => dataMap.get(label) || null);
    const colors = values.map(value => {
        if (value === null) return "#C0C0C0"; // Grey for missing data
        if (value >= normalMin && value <= normalMax) return "#0047FF"; // Normal
        if ((value >= normalMin - 1 && value < normalMin) || (value > normalMax && value <= normalMax + 1)) return "#FFA63E"; // Borderline
        return "#FA114F"; // Outlier
    });

    const configuration = {
        type: "line",
        data: {
            labels: labels,
            datasets: [
                {
                    label: "Temperature",
                    data: values,
                    borderColor: "#636363",
                    backgroundColor: "rgba(0,198,161, 0)",
                    pointBackgroundColor: colors,
                    pointBorderColor: colors,
                    spanGaps: true,
                    borderWidth: 2,
                    lineTension: 0.2,
                    pointStyle: "circle",
                    borderDash: [10, 10]
                },
                {
                    label: "Normal Temperature (98.6°F)",
                    data: Array(labels.length).fill(baseline),
                    borderColor: "#0047FF",
                    backgroundColor: "rgba(0, 139, 251, 0)",
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: false },
                x: { display: true }
            },
            plugins: {
                legend: { display: true, position: "bottom" }
            }
        }
    };
    return await chartJSNodeCanvas.renderToBuffer(configuration);
}

async function generatePDF(patientInfo, temperatureData, timeframeDays) {
    try {
        const pdfPath = path.join(__dirname, `patient_report_${Date.now()}.pdf`);
        const doc = new PDFDocument({ size: "A4", margin: 50 });
        const stream = fs.createWriteStream(pdfPath);
        doc.pipe(stream);

        // Title
        doc.fontSize(22).text("Patient Health Report", { align: "center" }).moveDown();
        doc.fontSize(14).text(`Name: ${patientInfo.name}`).moveDown(0.5);
        doc.text(`Age: ${patientInfo.age}`).moveDown(0.5);
        doc.text(`Report Date: ${moment().tz(TIMEZONE).format("DD MMM YYYY")}`).moveDown(1.5);

        // Temperature Chart
        if (temperatureData.logs.length) {
            doc.addPage();
            doc.fontSize(16).text(`Body Temperature (Last ${timeframeDays} days)`, { align: "center" }).moveDown();
            const chartImage = await generateTemperatureChart(temperatureData.logs, temperatureData.benchMark, timeframeDays);
            doc.image(chartImage, {
                width: 550,
                align: "center",
                valign: "center",
                x: (doc.page.width - 550) / 2 // Centering horizontally
            }).moveDown(2);
        }

        // Finalize PDF
        doc.end();

        stream.on("finish", () => {
            console.log("PDF generated successfully:", pdfPath);
        });
    } catch (error) {
        console.error("Error generating PDF:", error);
    }
}

// Example Usage with Timeframe Selection
const patientInfo = {
    name: "John Doe",
    age: 45,
    report_date: "2025-03-06"
};

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
        }
    ]
}
const temperatureData1 = {
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

const timeframeDays = 30; // Change this to 7, 30, or 120 days

generatePDF(patientInfo, temperatureData, timeframeDays);
