import sys
import logging
import os
import json
import hashlib
import requests
import subprocess
from urllib.parse import urljoin
from time import sleep
from json.decoder import JSONDecodeError

import shutil


def md5(fnpath):
    hash_md5 = hashlib.md5()
    with open(fnpath, 'rb') as fp:
        for chunk in iter(lambda: fp.read(4096), b''):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()


def check_transfer_success(host, fn_id, ftype, client_id, certfile):
    url = urljoin(host, 'files/md5/')
    params = {'fn_id': fn_id, 'client_id': client_id, 'ftype': ftype}
    return requests.get(url=url, params=params, verify=certfile)


def register_transfer(host, fn_id, fpath, ftype, client_id, certfile):
    url = urljoin(host, 'files/transferred/')
    postdata = {'fn_id': fn_id, 'filename': os.path.basename(fpath),
                'client_id': client_id,
                'ftype': ftype,
                }
    return requests.post(url=url, data=postdata, verify=certfile)


def register_file(host, fn, fn_md5, size, date, client_id, certfile, claimed):
    url = urljoin(host, 'files/register/')
    postdata = {'fn': fn,
                'client_id': client_id,
                'md5': fn_md5,
                'size': size,
                'date': date,
                'claimed': claimed,
                }
    return requests.post(url=url, data=postdata, verify=certfile)


def save_ledger(ledger, ledgerfile):
    with open(ledgerfile, 'w') as fp:
        json.dump(ledger, fp)


def transfer_file(fpath, transfer_location, keyfile):
    """Transfer location will be something like login@server:/path/to/storage"""
    logging.info('Transferring {} to {}'.format(fpath, transfer_location))
    remote_path = os.path.join(transfer_location + '/', os.path.basename(fpath))
    if sys.platform.startswith("win"):
        subprocess.check_call(['pscp.exe', '-i', keyfile, fpath, remote_path])
    else:
        subprocess.check_call(['scp', '-i', keyfile, fpath, remote_path])


def collect_outbox(outbox, ledger, ledgerfn):
    logging.info('Checking outbox')
    for fn in [os.path.join(outbox, x) for x in os.listdir(outbox)]:
        prod_date = str(os.path.getctime(fn))
        if fn not in ledger:
            logging.info('Found new file: {} produced {}'.format(fn, prod_date))
            ledger[fn] = {'fpath': fn, 'md5': False, 'ftype': 'raw',
                          'prod_date': str(os.path.getctime(fn)),
                          'registered': False, 'transferred': False,
                          'remote_checking': False, 'remote_ok': False}
            save_ledger(ledger, ledgerfn)
    for produced_fn in ledger.values():
        if not produced_fn['md5']:
            try:
                produced_fn['md5'] = md5(produced_fn['fpath'])
            except FileNotFoundError:
                logging.warning('Could not find file in outbox to check MD5')
                continue
            save_ledger(ledger, ledgerfn)


def register_outbox_files(ledger, ledgerfn, kantelehost, client_id, certfile, claimed=False):
    logging.info('Checking files to register')
    for fn, produced_fn in ledger.items():
        if not produced_fn['registered']:
            fn = os.path.basename(produced_fn['fpath'])
            size = os.path.getsize(produced_fn['fpath'])
            reg_response = register_file(kantelehost, fn, produced_fn['md5'],
                                         size, produced_fn['prod_date'],
                                         client_id, certfile, claimed)
            js_resp = reg_response.json()
            if js_resp['state'] == 'registered':
                produced_fn['remote_id'] = js_resp['file_id']
                produced_fn['registered'] = True
                if ('stored' in js_resp and js_resp['stored'] and
                        js_resp['md5'] == produced_fn['md5']):
                    produced_fn['transferred'] = True
            elif js_resp['state'] == 'error':
                logging.warning('Server reported an error', js_resp['msg'])
                if 'md5' in js_resp:
                    logging.warning('Registered and local file MD5 do {} match'
                                    ''.format('' if js_resp['md5'] ==
                                              produced_fn['md5'] else 'NOT'))
                    produced_fn['registered'] = True
                if 'file_id' in js_resp:
                    produced_fn['remote_id'] = js_resp['file_id']
            save_ledger(ledger, ledgerfn)


def transfer_outbox_files(ledger, ledgerfn, transfer_location, keyfile,
                          kantelehost, client_id, certfile):
    logging.info('Checking transfer of files')
    for produced_fn in ledger.values():
        if produced_fn['registered'] and not produced_fn['transferred']:
            logging.info('Found file not registerered, not transferred: {}'
                         ''.format(produced_fn['fpath']))
            try:
                transfer_file(produced_fn['fpath'], transfer_location, keyfile)
            except subprocess.CalledProcessError:
                logging.warning('Could not transfer {}'.format(
                    produced_fn['fpath']))
            else:
                produced_fn['transferred'] = True
                save_ledger(ledger, ledgerfn)
                register_transferred_files(ledger, ledgerfn, kantelehost,
                                           client_id, certfile)


def register_transferred_files(ledger, ledgerfn, kantelehost, client_id,
                               certfile):
    logging.info('Register transfer of files if necessary')
    for produced_fn in ledger.values():
        if produced_fn['transferred'] and not produced_fn['remote_checking']:
            response = register_transfer(kantelehost, produced_fn['remote_id'],
                                         produced_fn['fpath'],
                                         produced_fn['ftype'], client_id,
                                         certfile)
            try:
                js_resp = response.json()
            except JSONDecodeError:
                logging.warning('Server error registering file, will retry later')
                continue
            if js_resp['state'] == 'error':
                logging.warning('File with ID {} not registered yet'
                                ''.format(produced_fn['remote_id']))
                produced_fn.update({'md5': False, 'registered': False,
                                    'transferred': False,
                                    'remote_checking': False,
                                    'remote_ok': False})
            else:
                logging.info('Registered transfer of file '
                             '{}'.format(produced_fn['fpath']))
                produced_fn['remote_checking'] = True
            save_ledger(ledger, ledgerfn)


def check_success_transferred_files(ledger, ledgerfn, kantelehost, client_id,
                                    certfile):
    logging.info('Check transfer of files')
    for produced_fn in ledger.values():
        if produced_fn['remote_checking'] and not produced_fn['remote_ok']:
            response = check_transfer_success(kantelehost,
                                              produced_fn['remote_id'],
                                              produced_fn['ftype'],
                                              client_id, certfile)
            try:
                js_resp = response.json()
            except JSONDecodeError:
                logging.warning('Server error checking success transfer file, '
                             'trying again later')
                continue
            if not js_resp['md5_state']:
                continue
            elif js_resp['md5_state'] == 'error':
                produced_fn['transferred'] = False
                produced_fn['remote_checking'] = False
            elif js_resp['md5_state'] == 'ok':
                produced_fn['remote_ok'] = True
            save_ledger(ledger, ledgerfn)


def check_done(ledger, ledgerfn, kantelehost, client_id, donebox, certfile,
               globalloop):
    while True:
        check_success_transferred_files(ledger, ledgerfn, kantelehost,
                                        client_id, certfile)
        for file_done in [k for k, x in ledger.items() if x['remote_ok']]:
            file_done = ledger[file_done]['fpath']
            logging.info('Finished with file {}: '
                         '{}'.format(file_done, ledger[file_done]))
            try:
                shutil.move(file_done,
                            os.path.join(donebox, os.path.basename(file_done)))
            except FileNotFoundError:
                continue
            finally:
                del(ledger[file_done])
        save_ledger(ledger, ledgerfn)
        if globalloop:
            break
        sleep(10)


def set_logger():
    logging.basicConfig(level=logging.INFO,
                        format='%(asctime)s %(message)s',
                        handlers=[logging.StreamHandler(),
                                  logging.FileHandler('filetransfer.log')])


def main():
    set_logger()
    outbox = sys.argv[1]
    donebox = sys.argv[2]
    ledgerfn = sys.argv[3]
    kantelehost = sys.argv[4]  # http://host.com/kantele
    client_id = sys.argv[5]
    keyfile = sys.argv[6]
    transfer_location = sys.argv[7]  # SCP login@storageserver.com:/home/store
    globalloop = (False if len(sys.argv) == 9 and sys.argv[8] == 'noloop'
                  else True)
    try:
        with open(ledgerfn) as fp:
            ledger = json.load(fp)
    except IOError:
        ledger = {}
    while True:
        collect_outbox(outbox, ledger, ledgerfn)
        register_outbox_files(ledger, ledgerfn, kantelehost, client_id,
                              certfile)
        transfer_outbox_files(ledger, ledgerfn, transfer_location, keyfile,
                              kantelehost, client_id, certfile)
        # registers are done after each transfer, this one is to wrap them up
        register_transferred_files(ledger, ledgerfn, kantelehost, client_id,
                                   certfile)
        check_done(ledger, ledgerfn, kantelehost, client_id, donebox, certfile,
                   globalloop)
        if not globalloop:
            break
        sleep(10)


if __name__ == '__main__':
    main()
