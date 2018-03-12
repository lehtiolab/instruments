import os
import sys
import requests

import producer as p


def register_libraryfile(fn_id, description, host, client_id, certfile):
    url = urljoin(host, 'files/setlibrary/')
    postdata = {'fn_id': fn_id, 'client_id': client_id, 'desc': description}
    return requests.post(url=url, data=postdata, verify=certfile)


def main():
    p.set_logger()
    fnpath = sys.argv[1]
    description = sys.argv[2]
    ledgerfn = sys.argv[3]
    kantelehost = sys.argv[4]  # http://host.com/kantele
    client_id = sys.argv[5]
    keyfile = sys.argv[6]
    certfile = sys.argv[7]
    transfer_location = sys.argv[8]  # SCP login@storageserver.com:/home/store
    try:
        with open(ledgerfn) as fp:
            ledger = json.load(fp)
    except IOError:
        ledger = {}
    if fnpath not in ledger:
        ledger[fn] = {'fpath': fn, 'md5': False,
                      'prod_date': str(os.path.getctime(fn)),
                      'registered': False, 'transferred': False,
                      'remote_checking': False, 'remote_ok': False}
        save_ledger(ledger, ledgerfn)
    if not ledger[fn]['md5']
        ledger[fn]['md5'] = p.md5(fnpath)
    p.register_outbox_files(ledger, ledgerfn, kantelehost, client_id, certfile)
    p.transfer_outbox_files(ledger, ledgerfn, transfer_location, keyfile,
                            kantelehost, client_id, certfile)
    p.check_done(ledger, ledgerfn, kantelehost, client_id, fnpath, certfile, False)
    register_libraryfile(ledger[fn][ 'remote_id'], description, kantelehost, client_id, certfile)


if __name__ == '__main__':
    main()
