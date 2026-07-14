import Printer from "pdfmake/js/Printer.js";
import fs from "fs";
import path from "path";

/**
 * Configure fonts for pdfmake
 * Using Roboto fonts downloaded to the fonts directory
 */
const fonts = {
    Roboto: {
        normal: path.join(process.cwd(), "fonts", "Roboto-Regular.ttf"),
        bold: path.join(process.cwd(), "fonts", "Roboto-Medium.ttf"),
        italics: path.join(process.cwd(), "fonts", "Roboto-Italic.ttf"),
        bolditalics: path.join(process.cwd(), "fonts", "Roboto-MediumItalic.ttf"),
    },
};

const PdfPrinter = Printer.default || Printer;
const printer = new PdfPrinter(fonts);

/**
 * Generates a PDF for a published exam using pdfmake
 * @param {Object} exam - The exam object (title, instructions, duration, etc.)
 * @param {Array} questions - The approved questions for the exam
 * @param {String} outputPath - The path where the PDF should be saved
 * @returns {Promise<String>} - Returns the path of the generated PDF
 */
export const generateExamPDF = (exam, questions, outputPath) => {
    return new Promise(async (resolve, reject) => {
        try {
            const docDefinition = {
                content: [
                    // --- Header ---
                    {
                        stack: [
                            { text: exam.title || "Examination", style: "header" },
                            (exam.subjects && exam.subjects.length > 0)
                                ? { text: exam.subjects.join(", "), alignment: "center", margin: [0, 0, 0, 5] }
                                : "",
                            {
                                columns: [
                                    { text: `Difficulty: ${exam.difficulty || "N/A"}`, style: "metaData", width: "*" },
                                    { text: `Language: ${exam.language || "English"}`, style: "metaData", width: "auto" },
                                ]
                            },
                        ],
                        margin: [0, 0, 0, 10]
                    },

                    {
                        table: {
                            widths: ["*", "*"],
                            body: [
                                [
                                    { text: `Duration: ${exam.duration || "N/A"} min`, style: "infoBox" },
                                    { text: `Total marks: ${exam.totalMarks || 0}`, style: "infoBox", alignment: "right" }
                                ]
                            ]
                        },
                        layout: "noBorders"
                    },

                    {
                        canvas: [{ type: "line", x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 1, lineColor: "#333" }],
                        margin: [0, 5, 0, 15]
                    }
                ],
                styles: {
                    header: {
                        fontSize: 24,
                        bold: true,
                        alignment: "center",
                        margin: [0, 0, 0, 5],
                        color: "#2c3e50"
                    },
                    metaData: {
                        fontSize: 9,
                        italic: true,
                        color: "#7f8c8d"
                    },
                    infoBox: {
                        fontSize: 10,
                        bold: true,
                        margin: [0, 5, 0, 5]
                    },
                    sectionTitle: {
                        fontSize: 14,
                        bold: true,
                        color: "#2980b9",
                        margin: [0, 20, 0, 10],
                        border: [false, false, false, true]
                    },
                    questionText: {
                        fontSize: 12,
                        bold: true,
                        margin: [0, 0, 0, 5]
                    },
                    optionText: {
                        fontSize: 10,
                        margin: [20, 2, 0, 2]
                    },
                    footer: {
                        fontSize: 8,
                        italic: true,
                        color: "#95a5a6"
                    }
                },
                defaultStyle: {
                    font: "Roboto"
                },
                pageMargins: [40, 60, 40, 60]
            };

            // --- Description ---
            if (exam.description) {
                docDefinition.content.push({ text: "Description", style: "sectionTitle" });
                docDefinition.content.push({
                    text: exam.description,
                    fontSize: 10,
                    margin: [0, 0, 0, 10],
                    alignment: "justify"
                });
            }

            // --- Topics ---
            if (exam.topics && exam.topics.length > 0) {
                docDefinition.content.push({ text: `Topics: ${exam.topics.join(", ")}`, fontSize: 9, italic: true, margin: [0, 5, 0, 10] });
            }

            // --- Instructions ---
            if (exam.instructions) {
                docDefinition.content.push({ text: "Instructions:", style: "sectionTitle" });
                docDefinition.content.push({
                    text: exam.instructions,
                    fontSize: 10,
                    margin: [0, 0, 0, 10]
                });
            }

            // --- Questions Section ---
            docDefinition.content.push({ text: "Questions:", style: "sectionTitle" });

            questions.forEach((q, index) => {
                const questionBlock = {
                    stack: [
                        {
                            columns: [
                                { text: `${index + 1}. ${q.text}`, style: "questionText", width: "*" },
                                { text: `(${q.marks} Marks)`, style: "questionText", width: "auto", alignment: "right" }
                            ]
                        }
                    ],
                    margin: [0, 5, 0, 10],
                    unbreakable: true
                };

                // Options
                if (q.options && q.options.length > 0) {
                    q.options.forEach((opt, optIdx) => {
                        const label = String.fromCharCode(65 + optIdx); // A, B, C, D
                        questionBlock.stack.push({
                            text: `${label}) ${opt.text || opt}`,
                            style: "optionText"
                        });
                    });
                }

                docDefinition.content.push(questionBlock);
            });

            // --- Footer ---
            docDefinition.footer = (currentPage, pageCount) => {
                return {
                    columns: [
                        {
                            text: `Generated by Exam AI on ${new Date().toLocaleDateString()}`,
                            style: "footer",
                            alignment: "left",
                            margin: [40, 10]
                        },
                        {
                            text: `Page ${currentPage} of ${pageCount}`,
                            style: "footer",
                            alignment: "right",
                            margin: [0, 10, 40, 10]
                        }
                    ]
                };
            };

            // --- Generate PDF ---
            const pdfDoc = await printer.createPdfKitDocument(docDefinition);
            const stream = fs.createWriteStream(outputPath);

            pdfDoc.pipe(stream);
            pdfDoc.end();

            stream.on("finish", () => {
                resolve(outputPath);
            });

            stream.on("error", (err) => {
                reject(err);
            });
        } catch (error) {
            reject(error);
        }
    });
};
