const puppeteer = require('puppeteer');
const { exec } = require('child_process');
const path = require('path');

async function runTest() {
    console.log('Starting HTTP server...');
    const serverProcess = exec('npx http-server -p 8080', { cwd: __dirname });
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('Launching Puppeteer...');
    const browser = await puppeteer.launch({
        headless: "new"
    });
    
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1200, height: 800 });
        
        console.log('Navigating to app...');
        await page.goto('http://localhost:8080');
        
        // Wait for chart to load (Chart.js has an animation, we can wait a bit or disable it, but let's wait)
        await new Promise(r => setTimeout(r, 1000));

        console.log('Adding an expense...');
        await page.type('#amount', '50.50');
        await page.select('#category', 'Food');
        await page.type('#date', '2023-10-25');
        await page.type('#note', 'Groceries');
        await page.click('#submit-btn');

        await new Promise(r => setTimeout(r, 1000));

        console.log('Adding another expense...');
        await page.type('#amount', '100');
        await page.select('#category', 'Transport');
        await page.type('#date', '2023-10-26');
        await page.type('#note', 'Gas');
        await page.click('#submit-btn');
        
        await new Promise(r => setTimeout(r, 1000));

        console.log('Editing the first expense...');
        // Find edit button for Food
        await page.evaluate(() => {
            const btns = document.querySelectorAll('.edit-btn');
            if (btns.length > 0) btns[btns.length - 1].click(); // click the bottom one (which was the first added since sort by date desc could place it lower depending on date, let's just click one)
        });
        
        // clear and re-type amount
        await page.evaluate(() => document.getElementById('amount').value = '');
        await page.type('#amount', '60.00');
        await page.click('#submit-btn');

        await new Promise(r => setTimeout(r, 1000));

        console.log('Adding a third expense to delete...');
        await page.type('#amount', '200');
        await page.select('#category', 'Entertainment');
        await page.type('#date', '2023-10-27');
        await page.type('#note', 'Concert');
        await page.click('#submit-btn');

        await new Promise(r => setTimeout(r, 1000));

        console.log('Deleting the third expense...');
        // override confirm dialog
        page.on('dialog', async dialog => {
            console.log(dialog.message());
            await dialog.accept();
        });

        await page.evaluate(() => {
            const btns = document.querySelectorAll('.delete-btn');
            if (btns.length > 0) btns[0].click(); // click first delete button (latest date)
        });

        await new Promise(r => setTimeout(r, 1000));

        console.log('Taking screenshot...');
        const screenshotPath = path.join(__dirname, 'final_result.png');
        await page.screenshot({ path: screenshotPath });
        console.log(`Screenshot saved to ${screenshotPath}`);

    } catch (err) {
        console.error('Error during test:', err);
    } finally {
        console.log('Closing browser...');
        await browser.close();
        console.log('Killing server...');
        serverProcess.kill();
    }
}

runTest();
