import os
import sys
import requests
import json
from urllib.parse import urljoin
from time import sleep

import producer as p


def register_libraryfile(fn_item, ledger, ledgerfn, description, host,
                         client_id, certfile):
    if not fn_item['library'] and fn_item['remote_ok']:
        url = urljoin(host, 'files/setlibrary/')
        postdata = {'fn_id': fn_item['remote_id'], 'client_id': client_id,
                    'desc': description}
        reg_response = requests.post(url=url, data=postdata, verify=certfile)
        js_resp = reg_response.json()
        fn_item['library'] = js_resp['library']
    p.save_ledger(ledger, ledgerfn)


def check_transferred(fn_item, ledger, ledgerfn, kantelehost, client_id,
                      certfile):
    while True:
        p.check_success_transferred_files(ledger, ledgerfn, kantelehost,
                                          client_id, certfile)
        for file_done in [k for k, x in ledger.items() if x['remote_ok']]:
            file_done = ledger[file_done]['fpath']
#            logging.info('Finished with file {}: '
#                         '{}'.format(file_done, ledger[file_done]))
        p.save_ledger(ledger, ledgerfn)
        if fn_item['remote_ok']:
            break
        sleep(10)


def check_done(fn_item, ledger, ledgerfn, kantelehost, client_id, donebox,
               certfile):
    if not fn_item['library']:
        print('Problem creating a library from this file')
        return
    while True:
        url = urljoin(kantelehost, 'files/libfile/')
        params = {'fn_id': fn_item['remote_id']}
        reg_response = requests.get(url=url, params=params, verify=certfile)
        js_resp = reg_response.json()
        if js_resp['library'] and js_resp['ready']:
            del(ledger[fn_item['fpath']])
            break
        sleep(10)
    p.save_ledger(ledger, ledgerfn)


def main():
    p.set_logger()
    fnpath = sys.argv[1]
    ftype = sys.argv[2]
    description = sys.argv[3]
    ledgerfn = sys.argv[4]
    kantelehost = sys.argv[5]  # http://host.com/kantele
    client_id = sys.argv[6]
    keyfile = sys.argv[7]
    certfile = sys.argv[8]
    transfer_location = sys.argv[9]  # SCP login@storageserver.com:/home/store
    try:
        with open(ledgerfn) as fp:
            ledger = json.load(fp)
    except IOError:
        ledger = {}
    if fnpath not in ledger:
        ledger[fnpath] = {'fpath': fnpath, 'md5': False, 'ftype': ftype,
                          'prod_date': str(os.path.getctime(fnpath)),
                          'registered': False, 'transferred': False,
                          'remote_checking': False, 'remote_ok': False,
                          'library': False}
        p.save_ledger(ledger, ledgerfn)
    if not ledger[fnpath]['md5']:
        ledger[fnpath]['md5'] = p.md5(fnpath)
    p.register_outbox_files(ledger, ledgerfn, kantelehost, client_id, certfile)
    p.transfer_outbox_files(ledger, ledgerfn, transfer_location, keyfile,
                            kantelehost, client_id, certfile)
    p.register_transferred_files(ledger, ledgerfn, kantelehost, client_id,
                                 certfile)
    check_transferred(ledger[fnpath], ledger, ledgerfn, kantelehost, client_id,
                      certfile)
    register_libraryfile(ledger[fnpath], ledger, ledgerfn, description,
                         kantelehost, client_id, certfile)
    check_done(ledger[fnpath], ledger, ledgerfn, kantelehost, client_id,
               os.path.split(fnpath)[0], certfile)


if __name__ == '__main__':
    main()
