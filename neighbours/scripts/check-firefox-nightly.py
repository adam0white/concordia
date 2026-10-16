#!/usr/bin/env python3
"""Optional UI smoke check using an installed Firefox and geckodriver.

Requires Selenium in the caller's Python environment. Downloads no tools.
Always starts a new temporary profile; never connects to an existing browser.

Example:
  python scripts/check-firefox-nightly.py --base-url http://127.0.0.1:5305 \
    --binary '/Applications/Firefox Nightly.app/Contents/MacOS/firefox' \
    --driver /path/to/geckodriver --local-iframe

Native macOS headless windows can clamp to 500 CSS px. Optional local-only iframe
checks exercise 320/390 CSS px, not a phone or touch device. WebDriver pointer
clicks in narrow Firefox iframes have been inconsistent; those checks use keys.
Public sites are tested natively. This script does not bypass frame policies.
An optional --checkpoint must be a caller-authorized test save, never an owner
save selected implicitly. Checkpoint contents are imported only through the UI.
"""

import argparse
import json
import pathlib
import re
import tempfile
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import selenium
from selenium import webdriver
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service
from selenium.webdriver.support.ui import Select, WebDriverWait


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', required=True)
    parser.add_argument('--binary', required=True, type=pathlib.Path)
    parser.add_argument('--driver', required=True, type=pathlib.Path)
    parser.add_argument('--output', type=pathlib.Path)
    parser.add_argument('--checkpoint', type=pathlib.Path)
    parser.add_argument('--local-iframe', action='store_true')
    args = parser.parse_args()
    parsed = urlparse(args.base_url)
    if parsed.scheme not in ('http', 'https'):
        parser.error('--base-url must use http or https')
    if args.local_iframe and parsed.hostname not in ('127.0.0.1', 'localhost', '::1'):
        parser.error('--local-iframe is restricted to a local preview')
    for path in (args.binary, args.driver, args.checkpoint):
        if path is not None and not path.is_file():
            parser.error(f'File does not exist: {path}')
    output = (args.output or pathlib.Path(tempfile.mkdtemp(prefix='neighbours-nightly-'))).resolve()
    output.mkdir(parents=True, exist_ok=True)
    downloads = pathlib.Path(tempfile.mkdtemp(prefix='downloads-', dir=output))
    report = {'base_url': args.base_url, 'selenium': selenium.__version__, 'checks': [],
              'limits': ['Native macOS headless windows may clamp to 500 CSS px.',
                         'Local iframe checks are CSS viewport checks, not phone or touch tests.',
                         'Narrow iframe interactions use keyboard because pointer automation was inconsistent.']}
    browser = None
    server = None

    def record(name, **details):
        report['checks'].append({'name': name, **details})
        (output / 'report.json').write_text(json.dumps(report, indent=2))
        print(json.dumps(report['checks'][-1]), flush=True)

    def wait(condition, seconds=60):
        return WebDriverWait(browser, seconds).until(lambda _: condition())

    def body():
        return browser.find_element(By.TAG_NAME, 'body').text

    def clock():
        match = re.search(r'DAY (\d+)(?: IN ALDER QUAY)?\n(\d\d:\d\d)', body())
        return match.groups() if match else None

    def visible(tag):
        return [item for item in browser.find_elements(By.TAG_NAME, tag) if item.is_displayed()]

    def control(text, prefix=False):
        for tag in ('button', 'summary', 'a'):
            for item in visible(tag):
                label = ' '.join(item.text.split())
                if label == text or (prefix and label.startswith(text)):
                    return item
        raise AssertionError(f'Visible control not found: {text}')

    def click(text, prefix=False):
        item = control(text, prefix)
        browser.execute_script('arguments[0].scrollIntoView({block:"center"})', item)
        item.click()

    def shot(name):
        browser.save_screenshot(str(output / f'{name}.png'))

    def menu(keyboard=False):
        button = browser.find_element(By.CSS_SELECTOR, '[aria-label="Save and town options"]')
        button.send_keys(Keys.ENTER) if keyboard else button.click()
        wait(lambda: bool(visible('dialog')), 10)

    def close_menu():
        browser.switch_to.active_element.send_keys(Keys.ESCAPE)
        wait(lambda: not visible('dialog'), 10)

    def upload(path):
        browser.find_element(By.CSS_SELECTOR, 'input[type=file]').send_keys(str(path.resolve()))

    def paused():
        return bool(browser.find_elements(By.CSS_SELECTOR, '[aria-label="Play town"]'))

    def enter():
        if 'Enter town' in body():
            click('Enter town')
        wait(paused)

    def step():
        previous = clock()
        browser.find_element(By.CSS_SELECTOR, '[aria-label="Step: Advance one round"]').click()
        wait(lambda: clock() != previous)

    try:
        options = Options()
        options.binary_location = str(args.binary.resolve())
        for argument in ('-headless', '-no-remote', '-new-instance'):
            options.add_argument(argument)
        options.set_preference('browser.download.folderList', 2)
        options.set_preference('browser.download.dir', str(downloads))
        options.set_preference('browser.helperApps.neverAsk.saveToDisk',
                               'application/gzip,application/x-gzip,application/octet-stream,application/json')
        browser = webdriver.Firefox(options=options, service=Service(
            str(args.driver.resolve()), log_output=str(output / 'geckodriver.log')))
        report['browser'] = {key: browser.capabilities.get(key) for key in
                             ('browserName', 'browserVersion', 'moz:geckodriverVersion', 'moz:headless')}
        browser.set_window_size(500, 900)
        browser.get(args.base_url)
        wait(lambda: 'Enter town' in body())
        resources = browser.execute_script('return performance.getEntriesByType("resource").map(e=>e.name)')
        runtime = [url for url in resources if any(token in url.lower() for token in
                                                   ('pyodide', '.wasm', 'python_stdlib'))]
        assert not runtime, runtime
        record('welcome-before-runtime', passed=True)
        enter()
        assert clock() == ('1', '08:00') and paused()
        record('native-paused-entry', passed=True, dimensions=browser.execute_script(
            'return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth}'))
        shot('native-town')
        menu(keyboard=True)
        assert browser.switch_to.active_element.get_attribute('aria-label') == 'Close save and town options'
        close_menu()
        assert browser.switch_to.active_element.get_attribute('aria-label') == 'Save and town options'
        record('menu-keyboard-escape-focus', passed=True)
        step()
        menu()
        click('Export')
        wait(lambda: any('Download save' in item.text for item in visible('a')))
        control('Download save', prefix=True).click()
        wait(lambda: any(path.is_file() and path.suffix != '.part' for path in downloads.iterdir()))
        own_save = next(path for path in downloads.iterdir() if path.is_file() and path.suffix != '.part')
        assert own_save.read_bytes()[:2] == b'\x1f\x8b'
        record('compressed-export', passed=True, bytes=own_save.stat().st_size)
        for name, content, message in (
                ('malformed', '{broken', 'not valid JSON'),
                ('array', '[]', 'This save could not be loaded. Your current town is unchanged.')):
            invalid = output / f'{name}.json'
            invalid.write_text(content)
            previous = clock()
            upload(invalid)
            wait(lambda: message in body())
            assert clock() == previous
            record(f'{name}-import-preserves-town', passed=True, message=message)
        shot('invalid-import')
        close_menu()
        step()
        record('invalid-import-recovers-without-reload', passed=True, clock=clock())
        menu()
        upload(own_save)
        wait(lambda: clock() == ('1', '08:15'))
        close_menu()
        record('own-compressed-import', passed=True)
        click('Help')
        ActionChains(browser).double_click(control('Lend tools', prefix=True)).perform()
        wait(lambda: 'Tools added. 6 tools now available.' in body())
        assert '2 town credits left' in body()
        record('double-click-spends-once', passed=True)
        click('Lend tools', prefix=True)
        wait(lambda: 'Tools added. 9 tools now available.' in body())
        assert '1 town credits left' in body() or '1 town credit left' in body()
        record('separate-click-can-repeat', passed=True)
        menu()
        seed = browser.find_element(By.CSS_SELECTOR, 'input[type=number]')
        seed.clear()
        seed.send_keys('77')
        click('Start town')
        wait(lambda: clock() == ('1', '08:00'))
        assert paused()
        browser.refresh()
        wait(lambda: 'Enter town' in body())
        enter()
        assert clock() == ('1', '08:00') and paused()
        record('new-seed-paused-reload', passed=True)
        if args.checkpoint:
            menu()
            upload(args.checkpoint)
            wait(lambda: not visible('dialog') or 'Saved' in body())
            time.sleep(.5)
            if visible('dialog'):
                close_menu()
            record('explicit-checkpoint-import', passed=True, clock=clock())
        click('Inspector')
        click('Compare futures', prefix=True)
        detail = control('Compare futures', prefix=True).find_element(By.XPATH, '..')
        Select(detail.find_elements(By.TAG_NAME, 'select')[-1]).select_by_visible_text('Seven days · 672 rounds')
        previous = clock()
        click('Compare from here')
        cancel = wait(lambda: next((item for item in visible('button') if 'Cancel' in item.text), None), 10)
        cancel.click()
        wait(lambda: 'Comparison cancelled' in body())
        assert clock() == previous
        record('comparison-cancel-preserves-clock', passed=True)
        shot('comparison-cancel')

        if args.local_iframe:
            html = ('<html><body style="margin:0"><iframe title="Local CSS viewport check" '
                    f'src="{args.base_url}" width="320" height="740" style="border:0"></iframe></body></html>').encode()

            class Handler(BaseHTTPRequestHandler):
                def do_GET(self):
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/html')
                    self.end_headers()
                    self.wfile.write(html)

                def log_message(self, *_):
                    pass

            server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
            threading.Thread(target=server.serve_forever, daemon=True).start()
            browser.get(f'http://127.0.0.1:{server.server_port}/')
            for width, height in ((320, 740), (390, 844)):
                browser.switch_to.default_content()
                frame = browser.find_element(By.TAG_NAME, 'iframe')
                browser.execute_script('arguments[0].width=arguments[1];arguments[0].height=arguments[2]', frame, width, height)
                browser.switch_to.frame(frame)
                enter()
                click('Town')
                if '← Back to town' in body():
                    control('← Back to town').send_keys(Keys.ENTER)
                time.sleep(1)  # Allow the SVG to settle after resizing before visual review.
                dimensions = browser.execute_script(
                    'return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth}')
                assert dimensions['width'] == width and dimensions['scrollWidth'] <= width
                record(f'local-iframe-{width}', passed=True, dimensions=dimensions)
                shot(f'iframe-town-{width}')
                browser.find_element(By.CSS_SELECTOR, '[aria-label^="Ada ·"]').send_keys(Keys.ENTER)
                wait(lambda: 'carpenter' in body())
                menu(keyboard=True)
                shot(f'iframe-menu-{width}')
                close_menu()
                assert browser.switch_to.active_element.get_attribute('aria-label') == 'Save and town options'
                record(f'iframe-keyboard-menu-{width}', passed=True)
        record('completed', passed=True)
        return 0
    except Exception as error:
        record('failed', passed=False, error=str(error), traceback=traceback.format_exc())
        if browser:
            try:
                shot('failure')
            except Exception:
                pass
        return 1
    finally:
        if browser:
            browser.quit()
        if server:
            server.shutdown()
        print(f'Evidence: {output}', flush=True)


if __name__ == '__main__':
    raise SystemExit(main())
