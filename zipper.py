import sys
import os
import zipfile


def main():
    print(sys.argv)
    stripfn = sys.argv[1]
    outbox = sys.argv[2]
    folder_to_zip = sys.argv[3]
    print(folder_to_zip)
    arcname = folder_to_zip.replace(stripfn, '').replace('\\', '_')
    arcname = '{}.zip'.format(arcname)
    print('zipping to {}'.format(arcname))
    with zipfile.ZipFile(os.path.join(outbox, arcname), 'w') as zipfp:
        for fnpaths in os.walk(folder_to_zip):
            for fn in fnpaths[2]:
                zipfp.write(os.path.join(fnpaths[0], fn))


if __name__ == '__main__':
    main()
