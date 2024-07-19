const { parentPort, workerData } = require('worker_threads');
require("module-alias/register");
const axios = require('axios');
const fs = require('fs');
const path = require("path");
const FormData = require('form-data');
const { PDFDocument, rgb } = require('pdf-lib');
const puppeteer = require('puppeteer');
const fontkit = require("@pdf-lib/fontkit");


async function execute() {
    try {
      const { payload } = workerData;
      const { html_template_list, report_type, property } = payload;
  
      const browser = await puppeteer.launch({
        args: ["--no-sandbox"],
        headless: "new",
        // executablePath: '/usr/bin/chromium-browser',
        // args: ['--no-sandbox'],
        // headless: true,
      });
  
      const start_time = Date.now();
      const mergedPdf = await PDFDocument.create();
      mergedPdf.registerFontkit(fontkit);
  
      async function addPage(html, index) {
        const page = await browser.newPage();
        await page.setViewport({ width: 1200, height: 800 });
        await page.emulateMediaType("screen");
        await page.setContent(html);
        await page.addStyleTag({
          content: `
                  #footer1 {
                      position: fixed;
                      bottom: 0;
                      left: 0;
                      right: 0;
                      height: 0px;
                      text-align: center;
                      padding-top: 300px;
                      padding-bottom: 0px;
                      font-size: 12px;
                  }
                `,
        });
        const pdfBuffer = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: {
            top: "10px",
            bottom: "0px",
            left: "10px",
            right: "10px",
          },
          scale: 1,
          waitUntil: "networkidle2",
        });
        await page.close();
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const pages = pdfDoc.getPageIndices().length;
        return { pdfBuffer, pages, index };
      }
  
      let requ = [];
      for (let i = 0; i < html_template_list.length; i++) {
        // let css_url =
        //   "https://res.cloudinary.com/dcugtdlab/raw/upload/v1715702034/jw6l1ksqkfh3t2znjt2b.css";
          let css_url2 = `http://localhost:${process.env.PORT}/css/report.css`

        let html =
          `<!DOCTYPE html>
                  <html lang="en">
                  <head>
                      <meta charset="UTF-8">
                      <meta name="viewport" content="width=device-width, initial-scale=1.0">
                      <link rel="stylesheet" href="${css_url2}">
                  </head><body>` +
          html_template_list[i] +
          `<div class="footer page-width" id="footer1"></div>
                  </body>
                  </html>`;
  
        html_template_list[i] = html;
        requ.push(addPage(html, i));
      }
  
      let pdf_result = await Promise.all(requ);
      pdf_result.sort((a, b) => a.index - b.index); // Ensure the pages are in order
      requ = [];
      let page_num = 1;
  
      // First pass to replace PG_NUM placeholders
      for (let i = 0; i < pdf_result.length; i++) {
        let html = html_template_list[i];
        html = html.replace(/PG_NUM/g, page_num); // Make sure to replace all occurrences
        html = html.replace(/undefined/g, "");
        html = html.replace(/Invalid date/g, "N/A");
        html = html.replace(/null/g, "N/A");
        page_num += pdf_result[i].pages;
        html_template_list[i] = html;
      }
  
      // Second pass to replace REF_NUM placeholders in the TOC
      let tocPageNum = 1;
      let prevNumber = 1;
      for (let i = 0; i < pdf_result.length; i++) {
        let html = html_template_list[1];
        let itemNumber = `${prevNumber}`;
        html = html.replace("REF_NUM", tocPageNum); // Replace the first occurrence
        prevNumber = tocPageNum;
        tocPageNum += pdf_result[i].pages;
        html_template_list[1] = html;
      }
  
      // Generate PDFs with updated HTML
      for (let i = 0; i < html_template_list.length; i++) {
        requ.push(addPage(html_template_list[i], i));
      }
  
      const pdfBuffers = await Promise.all(requ);
  
      // Calculate the total number of pages in the merged PDF
      let totalPageCount = 0;
      pdfBuffers.forEach((result) => {
        totalPageCount += result.pages;
      });
  
      async function mergedPdfHTML(pdfDoc, startPage, totalPages) {
        const copiedPages = await mergedPdf.copyPages(
          pdfDoc,
          pdfDoc.getPageIndices()
        );
        // const fontPath = path.join(__dirname, "../../fonts/PlaywriteDEGrund-Regular.ttf");
        const fontPath = path.join(__dirname, "../../fonts/Arial.ttf");
        const fontBytes = fs.readFileSync(fontPath);
        const customFont = await mergedPdf.embedFont(fontBytes);
  
        copiedPages.forEach((page, idx) => {
          mergedPdf.addPage(page);
          const pageWidth = page.getWidth();
          const fontSize = 9;
          const footerY = 10;
          const marginX = 15;
          const pageNumberText = `Page ${startPage + idx} of ${totalPages}`;
          page.drawText(pageNumberText, {
            x: pageWidth - 70,
            y: footerY,
            size: fontSize,
            color: rgb(0, 0, 0),
            font: customFont,
          });
          const addressText = `Checkout Report for  ${property.address} , ${property.postcode}`;
          const textWidth = customFont.widthOfTextAtSize(addressText, fontSize);
          page.drawText(addressText, {
            x: marginX,
            y: footerY,
            size: fontSize,
            color: rgb(0, 0, 0),
            font: customFont,
          });
        });
      }
  
      let requester = [];
      let currentPage = 1;
  
      for (let i = 0; i < pdfBuffers.length; i++) {
        const pdfDoc = await PDFDocument.load(pdfBuffers[i].pdfBuffer);
        requester.push(mergedPdfHTML(pdfDoc, currentPage, totalPageCount));
        currentPage += pdfBuffers[i].pages;
      }
  
      await Promise.all(requester);
      const pdfBytes = await mergedPdf.save();
      let file_path = `${__dirname}/doc-${Date.now()}.pdf`;
      fs.writeFileSync(file_path, pdfBytes);
  
      let data = new FormData();
      data.append("compression_level", "medium");
      data.append("file", fs.createReadStream(file_path));
  
      let config = {
        method: "post",
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        url: "https://api.pdfrest.com/compressed-pdf",
        headers: {
          Accept: "application/json",
          "Api-Key": process.env.PDF_COMPRESSION_KEY,
          ...data.getHeaders(),
        },
        data: data,
      };
  
      const response = await axios(config);
      fs.unlinkSync(file_path);
      await browser.close();
  
      parentPort.postMessage(response.data);
    } catch (error) {
      console.error("compressPDF Error:", error);
      throw error;
    }
  }

execute();
