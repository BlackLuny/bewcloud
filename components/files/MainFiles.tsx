import { useSignal } from '@preact/signals';

import { Directory, DirectoryFile } from '/lib/types.ts';
import { ResponseBody as UploadResponseBody } from '/routes/api/files/upload.tsx';
import { RequestBody as RenameRequestBody, ResponseBody as RenameResponseBody } from '/routes/api/files/rename.tsx';
import { RequestBody as MoveRequestBody, ResponseBody as MoveResponseBody } from '/routes/api/files/move.tsx';
import { RequestBody as DeleteRequestBody, ResponseBody as DeleteResponseBody } from '/routes/api/files/delete.tsx';
import {
  RequestBody as CreateDirectoryRequestBody,
  ResponseBody as CreateDirectoryResponseBody,
} from '/routes/api/files/create-directory.tsx';
import {
  RequestBody as RenameDirectoryRequestBody,
  ResponseBody as RenameDirectoryResponseBody,
} from '/routes/api/files/rename-directory.tsx';
import {
  RequestBody as MoveDirectoryRequestBody,
  ResponseBody as MoveDirectoryResponseBody,
} from '/routes/api/files/move-directory.tsx';
import {
  RequestBody as DeleteDirectoryRequestBody,
  ResponseBody as DeleteDirectoryResponseBody,
} from '/routes/api/files/delete-directory.tsx';
import {
  RequestBody as CreateShareRequestBody,
  ResponseBody as CreateShareResponseBody,
} from '/routes/api/files/create-share.tsx';
import {
  RequestBody as UpdateShareRequestBody,
  ResponseBody as UpdateShareResponseBody,
} from '/routes/api/files/update-share.tsx';
import {
  RequestBody as DeleteShareRequestBody,
  ResponseBody as DeleteShareResponseBody,
} from '/routes/api/files/delete-share.tsx';
import SearchFiles from './SearchFiles.tsx';
import ListFiles from './ListFiles.tsx';
import FilesBreadcrumb from './FilesBreadcrumb.tsx';
import CreateDirectoryModal from './CreateDirectoryModal.tsx';
import RenameDirectoryOrFileModal from './RenameDirectoryOrFileModal.tsx';
import MoveDirectoryOrFileModal from './MoveDirectoryOrFileModal.tsx';
import CreateShareModal from './CreateShareModal.tsx';
import ManageShareModal from './ManageShareModal.tsx';

interface MainFilesProps {
  initialDirectories: Directory[];
  initialFiles: DirectoryFile[];
  initialPath: string;
  baseUrl: string;
  isFileSharingAllowed: boolean;
  fileShareId?: string;
}

export default function MainFiles(
  { initialDirectories, initialFiles, initialPath, baseUrl, isFileSharingAllowed, fileShareId }: MainFilesProps,
) {
  const isAdding = useSignal<boolean>(false);
  const isUploading = useSignal<boolean>(false);
  const isDeleting = useSignal<boolean>(false);
  const isUpdating = useSignal<boolean>(false);
  const directories = useSignal<Directory[]>(initialDirectories);
  const files = useSignal<DirectoryFile[]>(initialFiles);
  const path = useSignal<string>(initialPath);
  const chosenDirectories = useSignal<Pick<Directory, 'parent_path' | 'directory_name'>[]>([]);
  const chosenFiles = useSignal<Pick<DirectoryFile, 'parent_path' | 'file_name'>[]>([]);
  const isAnyItemChosen = chosenDirectories.value.length > 0 || chosenFiles.value.length > 0;
  const bulkItemsCount = chosenDirectories.value.length + chosenFiles.value.length;
  const areNewOptionsOpen = useSignal<boolean>(false);
  const areBulkOptionsOpen = useSignal<boolean>(false);
  const isNewDirectoryModalOpen = useSignal<boolean>(false);
  const renameDirectoryOrFileModal = useSignal<
    { isOpen: boolean; isDirectory: boolean; parentPath: string; name: string } | null
  >(null);
  const moveDirectoryOrFileModal = useSignal<
    { isOpen: boolean; isDirectory: boolean; path: string; name: string } | null
  >(null);
  const createShareModal = useSignal<{ isOpen: boolean; filePath: string; password?: string } | null>(null);
  const manageShareModal = useSignal<{ isOpen: boolean; fileShareId: string } | null>(null);

  // 分块上传辅助函数
  async function uploadFileInChunks(file: File, parentPath: string, pathInView: string): Promise<boolean> {
    const CHUNK_SIZE = 1024 * 1024; // 1MB chunks for minimal memory usage
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const fileId = `${Date.now()}_${Math.random().toString(36)}_${file.name}`;

    console.log(`开始分块上传: ${file.name}, 大小: ${(file.size / 1024 / 1024).toFixed(2)}MB, 分块数: ${totalChunks}`);

    try {
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        console.log(`上传块 ${i + 1}/${totalChunks}, 大小: ${(chunk.size / 1024).toFixed(1)}KB`);

        const response = await fetch('/api/files/upload-chunk', {
          method: 'POST',
          headers: {
            'x-file-name': file.name,
            'x-parent-path': parentPath,
            'x-path-in-view': pathInView,
            'x-chunk-index': i.toString(),
            'x-total-chunks': totalChunks.toString(),
            'x-file-id': fileId,
          },
          body: chunk,
        });

        if (!response.ok) {
          throw new Error(`分块上传失败: ${response.statusText}`);
        }

        const result = await response.json();
        
        if (!result.success) {
          throw new Error('分块保存失败!');
        }

        // 如果是最后一块且文件完成
        if (result.isComplete) {
          console.log(`文件上传完成: ${file.name}`);
          files.value = [...result.newFiles];
          directories.value = [...result.newDirectories];
          return true;
        }
      }
      return true;
    } catch (error) {
      console.error('分块上传错误:', error);
      throw error;
    }
  }

  function onClickUploadFile(uploadDirectory = false) {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    if (uploadDirectory) {
      fileInput.webkitdirectory = true;
      // @ts-expect-error - mozdirectory is not typed
      fileInput.mozdirectory = true;
      // @ts-expect-error - directory is not typed
      fileInput.directory = true;
    }
    fileInput.click();

    fileInput.onchange = async (event) => {
      const chosenFilesList = (event.target as HTMLInputElement)?.files!;
      const chosenFiles = Array.from(chosenFilesList);

      isUploading.value = true;
      areNewOptionsOpen.value = false;

      for (const chosenFile of chosenFiles) {
        if (!chosenFile) {
          continue;
        }

        try {
          let parentPath = path.value;
          
          // Keep directory structure if the file comes from a chosen directory
          if (chosenFile.webkitRelativePath) {
            const directoryPath = chosenFile.webkitRelativePath.replace(chosenFile.name, '');
            parentPath = `${path.value}${directoryPath}`;
          }

          const fileSize = chosenFile.size;
          const fileSizeMB = fileSize / 1024 / 1024;

          // 对于大于10MB的文件使用分块上传，小文件使用传统方式
          if (fileSizeMB > 10) {
            console.log(`大文件检测 (${fileSizeMB.toFixed(2)}MB)，使用分块上传`);
            await uploadFileInChunks(chosenFile, parentPath, path.value);
          } else {
            console.log(`小文件 (${fileSizeMB.toFixed(2)}MB)，使用传统上传`);
            
            const requestBody = new FormData();
            requestBody.set('path_in_view', path.value);
            requestBody.set('parent_path', parentPath);
            requestBody.set('name', chosenFile.name);
            requestBody.set('contents', chosenFile);

            const response = await fetch('/api/files/upload', {
              method: 'POST',
              body: requestBody,
            });

            if (!response.ok) {
              throw new Error(`Failed to upload file. ${response.statusText} ${await response.text()}`);
            }

            const result = await response.json() as UploadResponseBody;

            if (!result.success) {
              throw new Error('Failed to upload file!');
            }

            files.value = [...result.newFiles];
            directories.value = [...result.newDirectories];
          }
        } catch (error) {
          console.error(`上传失败: ${chosenFile.name}`, error);
          alert(`文件 "${chosenFile.name}" 上传失败: ${error.message}`);
        }
      }

      isUploading.value = false;
    };
  }

  function onClickCreateDirectory() {
    if (isNewDirectoryModalOpen.value) {
      isNewDirectoryModalOpen.value = false;
      return;
    }

    isNewDirectoryModalOpen.value = true;
  }

  async function onClickSaveDirectory(newDirectoryName: string) {
    if (isAdding.value) {
      return;
    }

    if (!newDirectoryName) {
      return;
    }

    areNewOptionsOpen.value = false;
    isAdding.value = true;

    try {
      const requestBody: CreateDirectoryRequestBody = {
        parentPath: path.value,
        name: newDirectoryName,
      };
      const response = await fetch(`/api/files/create-directory`, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Failed to create directory. ${response.statusText} ${await response.text()}`);
      }

      const result = await response.json() as CreateDirectoryResponseBody;

      if (!result.success) {
        throw new Error('Failed to create directory!');
      }

      directories.value = [...result.newDirectories];

      isNewDirectoryModalOpen.value = false;
    } catch (error) {
      console.error(error);
    }

    isAdding.value = false;
  }

  function onCloseCreateDirectory() {
    isNewDirectoryModalOpen.value = false;
  }

  function toggleNewOptionsDropdown() {
    areNewOptionsOpen.value = !areNewOptionsOpen.value;
  }

  function toggleBulkOptionsDropdown() {
    areBulkOptionsOpen.value = !areBulkOptionsOpen.value;
  }

  function onClickOpenRenameDirectory(parentPath: string, name: string) {
    renameDirectoryOrFileModal.value = {
      isOpen: true,
      isDirectory: true,
      parentPath,
      name,
    };
  }

  function onClickOpenRenameFile(parentPath: string, name: string) {
    renameDirectoryOrFileModal.value = {
      isOpen: true,
      isDirectory: false,
      parentPath,
      name,
    };
  }

  function onClickCloseRename() {
    renameDirectoryOrFileModal.value = null;
  }

  async function onClickSaveRenameDirectory(newName: string) {
    if (
      isUpdating.value || !renameDirectoryOrFileModal.value?.isOpen || !renameDirectoryOrFileModal.value?.isDirectory
    ) {
      return;
    }

    isUpdating.value = true;

    try {
      const requestBody: RenameDirectoryRequestBody = {
        parentPath: renameDirectoryOrFileModal.value.parentPath,
        oldName: renameDirectoryOrFileModal.value.name,
        newName,
      };
      const response = await fetch(`/api/files/rename-directory`, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Failed to rename directory. ${response.statusText} ${await response.text()}`);
      }

      const result = await response.json() as RenameDirectoryResponseBody;

      if (!result.success) {
        throw new Error('Failed to rename directory!');
      }

      directories.value = [...result.newDirectories];
    } catch (error) {
      console.error(error);
    }

    isUpdating.value = false;
    renameDirectoryOrFileModal.value = null;
  }

  async function onClickSaveRenameFile(newName: string) {
    if (
      isUpdating.value || !renameDirectoryOrFileModal.value?.isOpen || renameDirectoryOrFileModal.value?.isDirectory
    ) {
      return;
    }

    isUpdating.value = true;

    try {
      const requestBody: RenameRequestBody = {
        parentPath: renameDirectoryOrFileModal.value.parentPath,
        oldName: renameDirectoryOrFileModal.value.name,
        newName,
      };
      const response = await fetch(`/api/files/rename`, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Failed to rename file. ${response.statusText} ${await response.text()}`);
      }

      const result = await response.json() as RenameResponseBody;

      if (!result.success) {
        throw new Error('Failed to rename file!');
      }

      files.value = [...result.newFiles];
    } catch (error) {
      console.error(error);
    }

    isUpdating.value = false;
    renameDirectoryOrFileModal.value = null;
  }

  function onClickOpenMoveDirectory(parentPath: string, name: string) {
    moveDirectoryOrFileModal.value = {
      isOpen: true,
      isDirectory: true,
      path: parentPath,
      name,
    };
  }

  function onClickOpenMoveFile(parentPath: string, name: string) {
    moveDirectoryOrFileModal.value = {
      isOpen: true,
      isDirectory: false,
      path: parentPath,
      name,
    };
  }

  function onClickCloseMove() {
    moveDirectoryOrFileModal.value = null;
  }

  async function onClickSaveMoveDirectory(newPath: string) {
    if (isUpdating.value || !moveDirectoryOrFileModal.value?.isOpen || !moveDirectoryOrFileModal.value?.isDirectory) {
      return;
    }

    isUpdating.value = true;

    try {
      const requestBody: MoveDirectoryRequestBody = {
        oldParentPath: moveDirectoryOrFileModal.value.path,
        newParentPath: newPath,
        name: moveDirectoryOrFileModal.value.name,
      };
      const response = await fetch(`/api/files/move-directory`, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Failed to move directory. ${response.statusText} ${await response.text()}`);
      }

      const result = await response.json() as MoveDirectoryResponseBody;

      if (!result.success) {
        throw new Error('Failed to move directory!');
      }

      directories.value = [...result.newDirectories];
    } catch (error) {
      console.error(error);
    }

    isUpdating.value = false;
    moveDirectoryOrFileModal.value = null;
  }

  async function onClickSaveMoveFile(newPath: string) {
    if (isUpdating.value || !moveDirectoryOrFileModal.value?.isOpen || moveDirectoryOrFileModal.value?.isDirectory) {
      return;
    }

    isUpdating.value = true;

    try {
      const requestBody: MoveRequestBody = {
        oldParentPath: moveDirectoryOrFileModal.value.path,
        newParentPath: newPath,
        name: moveDirectoryOrFileModal.value.name,
      };
      const response = await fetch(`/api/files/move`, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Failed to move file. ${response.statusText} ${await response.text()}`);
      }

      const result = await response.json() as MoveResponseBody;

      if (!result.success) {
        throw new Error('Failed to move file!');
      }

      files.value = [...result.newFiles];
    } catch (error) {
      console.error(error);
    }

    isUpdating.value = false;
    moveDirectoryOrFileModal.value = null;
  }

  async function onClickDeleteDirectory(parentPath: string, name: string, isBulkDeleting = false) {
    if (isBulkDeleting || confirm('Are you sure you want to delete this directory?')) {
      if (!isBulkDeleting && isDeleting.value) {
        return;
      }

      isDeleting.value = true;

      try {
        const requestBody: DeleteDirectoryRequestBody = {
          parentPath,
          name,
        };
        const response = await fetch(`/api/files/delete-directory`, {
          method: 'POST',
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          throw new Error(`Failed to delete directory. ${response.statusText} ${await response.text()}`);
        }

        const result = await response.json() as DeleteDirectoryResponseBody;

        if (!result.success) {
          throw new Error('Failed to delete directory!');
        }

        directories.value = [...result.newDirectories];
      } catch (error) {
        console.error(error);
      }

      isDeleting.value = false;
    }
  }

  async function onClickDeleteFile(parentPath: string, name: string, isBulkDeleting = false) {
    if (isBulkDeleting || confirm('Are you sure you want to delete this file?')) {
      if (!isBulkDeleting && isDeleting.value) {
        return;
      }

      isDeleting.value = true;

      try {
        const requestBody: DeleteRequestBody = {
          parentPath,
          name,
        };
        const response = await fetch(`/api/files/delete`, {
          method: 'POST',
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          throw new Error(`Failed to delete file. ${response.statusText} ${await response.text()}`);
        }

        const result = await response.json() as DeleteResponseBody;

        if (!result.success) {
          throw new Error('Failed to delete file!');
        }

        files.value = [...result.newFiles];
      } catch (error) {
        console.error(error);
      }

      isDeleting.value = false;
    }
  }

  function onClickChooseDirectory(parentPath: string, name: string) {
    if (parentPath === '/' && name === '.Trash') {
      return;
    }

    const chosenDirectoryIndex = chosenDirectories.value.findIndex((directory) =>
      directory.parent_path === parentPath && directory.directory_name === name
    );

    if (chosenDirectoryIndex === -1) {
      chosenDirectories.value = [...chosenDirectories.value, { parent_path: parentPath, directory_name: name }];
    } else {
      const newChosenDirectories = chosenDirectories.peek();
      newChosenDirectories.splice(chosenDirectoryIndex, 1);
      chosenDirectories.value = [...newChosenDirectories];
    }
  }

  function onClickChooseFile(parentPath: string, name: string) {
    const chosenFileIndex = chosenFiles.value.findIndex((file) =>
      file.parent_path === parentPath && file.file_name === name
    );

    if (chosenFileIndex === -1) {
      chosenFiles.value = [...chosenFiles.value, { parent_path: parentPath, file_name: name }];
    } else {
      const newChosenFiles = chosenFiles.peek();
      newChosenFiles.splice(chosenFileIndex, 1);
      chosenFiles.value = [...newChosenFiles];
    }
  }

  async function onClickBulkDelete() {
    if (
      confirm(
        `Are you sure you want to delete ${bulkItemsCount === 1 ? 'this' : 'these'} ${bulkItemsCount} item${
          bulkItemsCount === 1 ? '' : 's'
        }?`,
      )
    ) {
      if (isDeleting.value) {
        return;
      }

      isDeleting.value = true;

      try {
        for (const directory of chosenDirectories.value) {
          await onClickDeleteDirectory(directory.parent_path, directory.directory_name, true);
        }

        for (const file of chosenFiles.value) {
          await onClickDeleteDirectory(file.parent_path, file.file_name, true);
        }

        chosenDirectories.value = [];
        chosenFiles.value = [];
      } catch (error) {
        console.error(error);
      }

      isDeleting.value = false;
    }
  }

  function onClickCreateShare(filePath: string) {
    if (createShareModal.value?.isOpen) {
      createShareModal.value = null;
      return;
    }

    createShareModal.value = {
      isOpen: true,
      filePath,
    };
  }

  async function onClickSaveFileShare(filePath: string, password?: string) {
    if (isAdding.value) {
      return;
    }

    if (!filePath) {
      return;
    }

    isAdding.value = true;

    try {
      const requestBody: CreateShareRequestBody = {
        pathInView: path.value,
        filePath,
        password,
      };
      const response = await fetch(`/api/files/create-share`, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Failed to create share. ${response.statusText} ${await response.text()}`);
      }

      const result = await response.json() as CreateShareResponseBody;

      if (!result.success) {
        throw new Error('Failed to create share!');
      }

      directories.value = [...result.newDirectories];
      files.value = [...result.newFiles];

      createShareModal.value = null;

      onClickOpenManageShare(result.createdFileShareId);
    } catch (error) {
      console.error(error);
    }

    isAdding.value = false;
  }

  function onClickCloseFileShare() {
    createShareModal.value = null;
  }

  function onClickOpenManageShare(fileShareId: string) {
    manageShareModal.value = {
      isOpen: true,
      fileShareId,
    };
  }

  async function onClickUpdateFileShare(fileShareId: string, password?: string) {
    if (isUpdating.value) {
      return;
    }

    if (!fileShareId) {
      return;
    }

    isUpdating.value = true;

    try {
      const requestBody: UpdateShareRequestBody = {
        pathInView: path.value,
        fileShareId,
        password,
      };
      const response = await fetch(`/api/files/update-share`, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Failed to update share. ${response.statusText} ${await response.text()}`);
      }

      const result = await response.json() as UpdateShareResponseBody;

      if (!result.success) {
        throw new Error('Failed to update share!');
      }

      directories.value = [...result.newDirectories];
      files.value = [...result.newFiles];

      manageShareModal.value = null;
    } catch (error) {
      console.error(error);
    }

    isUpdating.value = false;
  }

  function onClickCloseManageShare() {
    manageShareModal.value = null;
  }

  async function onClickDeleteFileShare(fileShareId: string) {
    if (!fileShareId || isDeleting.value || !confirm('Are you sure you want to delete this public share link?')) {
      return;
    }

    isDeleting.value = true;

    try {
      const requestBody: DeleteShareRequestBody = {
        pathInView: path.value,
        fileShareId,
      };
      const response = await fetch(`/api/files/delete-share`, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Failed to delete file share. ${response.statusText} ${await response.text()}`);
      }

      const result = await response.json() as DeleteShareResponseBody;

      if (!result.success) {
        throw new Error('Failed to delete file share!');
      }

      directories.value = [...result.newDirectories];
      files.value = [...result.newFiles];

      manageShareModal.value = null;
    } catch (error) {
      console.error(error);
    }

    isDeleting.value = false;
  }

  return (
    <>
      <section class='flex flex-row items-center justify-between mb-4'>
        <section class='relative inline-block text-left mr-2'>
          <section class='flex flex-row items-center justify-start'>
            {!fileShareId ? <SearchFiles /> : null}

            {isAnyItemChosen
              ? (
                <section class='relative inline-block text-left ml-2'>
                  <div>
                    <button
                      class='inline-block justify-center gap-x-1.5 rounded-md bg-[#51A4FB] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-400 ml-2 w-11 h-9'
                      type='button'
                      title='Bulk actions'
                      id='bulk-button'
                      aria-expanded='true'
                      aria-haspopup='true'
                      onClick={() => toggleBulkOptionsDropdown()}
                    >
                      <img
                        src={`/images/${areBulkOptionsOpen.value ? 'hide-options' : 'show-options'}.svg`}
                        alt='Bulk actions'
                        class={`white w-5 max-w-5`}
                        width={20}
                        height={20}
                      />
                    </button>
                  </div>

                  <div
                    class={`absolute left-0 z-10 mt-2 w-44 origin-top-left rounded-md bg-slate-700 shadow-lg ring-1 ring-black ring-opacity-15 focus:outline-none ${
                      !areBulkOptionsOpen.value ? 'hidden' : ''
                    }`}
                    role='menu'
                    aria-orientation='vertical'
                    aria-labelledby='bulk-button'
                    tabindex={-1}
                  >
                    <div class='py-1'>
                      <button
                        class={`text-white block px-4 py-2 text-sm w-full text-left hover:bg-slate-600`}
                        onClick={() => onClickBulkDelete()}
                        type='button'
                      >
                        Delete {bulkItemsCount} item{bulkItemsCount === 1 ? '' : 's'}
                      </button>
                    </div>
                  </div>
                </section>
              )
              : null}
          </section>
        </section>

        <section class='flex items-center justify-end'>
          <FilesBreadcrumb path={path.value} fileShareId={fileShareId} />

          {!fileShareId
            ? (
              <section class='relative inline-block text-left ml-2'>
                <div>
                  <button
                    class='inline-block justify-center gap-x-1.5 rounded-md bg-[#51A4FB] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-400 ml-2'
                    type='button'
                    title='Add new file or directory'
                    id='new-button'
                    aria-expanded='true'
                    aria-haspopup='true'
                    onClick={() => toggleNewOptionsDropdown()}
                  >
                    <img
                      src='/images/add.svg'
                      alt='Add new file or directory'
                      class={`white ${isAdding.value || isUploading.value ? 'animate-spin' : ''}`}
                      width={20}
                      height={20}
                    />
                  </button>
                </div>

                <div
                  class={`absolute right-0 z-10 mt-2 w-44 origin-top-right rounded-md bg-slate-700 shadow-lg ring-1 ring-black ring-opacity-15 focus:outline-none ${
                    !areNewOptionsOpen.value ? 'hidden' : ''
                  }`}
                  role='menu'
                  aria-orientation='vertical'
                  aria-labelledby='new-button'
                  tabindex={-1}
                >
                  <div class='py-1'>
                    <button
                      class={`text-white block px-4 py-2 text-sm w-full text-left hover:bg-slate-600`}
                      onClick={() => onClickUploadFile()}
                      type='button'
                    >
                      Upload Files
                    </button>
                    <button
                      class={`text-white block px-4 py-2 text-sm w-full text-left hover:bg-slate-600`}
                      onClick={() => onClickUploadFile(true)}
                      type='button'
                    >
                      Upload Directory
                    </button>
                    <button
                      class={`text-white block px-4 py-2 text-sm w-full text-left hover:bg-slate-600`}
                      onClick={() => onClickCreateDirectory()}
                      type='button'
                    >
                      New Directory
                    </button>
                  </div>
                </div>
              </section>
            )
            : null}
        </section>
      </section>

      <section class='mx-auto max-w-7xl my-8'>
        <ListFiles
          directories={directories.value}
          files={files.value}
          chosenDirectories={chosenDirectories.value}
          chosenFiles={chosenFiles.value}
          onClickChooseDirectory={onClickChooseDirectory}
          onClickChooseFile={onClickChooseFile}
          onClickOpenRenameDirectory={onClickOpenRenameDirectory}
          onClickOpenRenameFile={onClickOpenRenameFile}
          onClickOpenMoveDirectory={onClickOpenMoveDirectory}
          onClickOpenMoveFile={onClickOpenMoveFile}
          onClickDeleteDirectory={onClickDeleteDirectory}
          onClickDeleteFile={onClickDeleteFile}
          onClickCreateShare={isFileSharingAllowed ? onClickCreateShare : undefined}
          onClickOpenManageShare={isFileSharingAllowed ? onClickOpenManageShare : undefined}
          fileShareId={fileShareId}
        />

        <span
          class={`flex justify-end items-center text-sm mt-1 mx-2 text-slate-100`}
        >
          {isDeleting.value
            ? (
              <>
                <img src='/images/loading.svg' class='white mr-2' width={18} height={18} />Deleting...
              </>
            )
            : null}
          {isAdding.value
            ? (
              <>
                <img src='/images/loading.svg' class='white mr-2' width={18} height={18} />Creating...
              </>
            )
            : null}
          {isUploading.value
            ? (
              <>
                <img src='/images/loading.svg' class='white mr-2' width={18} height={18} />Uploading...
              </>
            )
            : null}
          {isUpdating.value
            ? (
              <>
                <img src='/images/loading.svg' class='white mr-2' width={18} height={18} />Updating...
              </>
            )
            : null}
          {!isDeleting.value && !isAdding.value && !isUploading.value && !isUpdating.value ? <>&nbsp;</> : null}
        </span>
      </section>

      {!fileShareId
        ? (
          <section class='flex flex-row items-center justify-start my-12'>
            <span class='font-semibold'>WebDav URL:</span>{' '}
            <code class='bg-slate-600 mx-2 px-2 py-1 rounded-md'>{baseUrl}/dav</code>
          </section>
        )
        : null}

      {!fileShareId
        ? (
          <CreateDirectoryModal
            isOpen={isNewDirectoryModalOpen.value}
            onClickSave={onClickSaveDirectory}
            onClose={onCloseCreateDirectory}
          />
        )
        : null}

      {!fileShareId
        ? (
          <RenameDirectoryOrFileModal
            isOpen={renameDirectoryOrFileModal.value?.isOpen || false}
            isDirectory={renameDirectoryOrFileModal.value?.isDirectory || false}
            initialName={renameDirectoryOrFileModal.value?.name || ''}
            onClickSave={renameDirectoryOrFileModal.value?.isDirectory
              ? onClickSaveRenameDirectory
              : onClickSaveRenameFile}
            onClose={onClickCloseRename}
          />
        )
        : null}

      {!fileShareId
        ? (
          <MoveDirectoryOrFileModal
            isOpen={moveDirectoryOrFileModal.value?.isOpen || false}
            isDirectory={moveDirectoryOrFileModal.value?.isDirectory || false}
            initialPath={moveDirectoryOrFileModal.value?.path || ''}
            name={moveDirectoryOrFileModal.value?.name || ''}
            onClickSave={moveDirectoryOrFileModal.value?.isDirectory ? onClickSaveMoveDirectory : onClickSaveMoveFile}
            onClose={onClickCloseMove}
          />
        )
        : null}

      {!fileShareId && isFileSharingAllowed
        ? (
          <CreateShareModal
            isOpen={createShareModal.value?.isOpen || false}
            filePath={createShareModal.value?.filePath || ''}
            password={createShareModal.value?.password || ''}
            onClickSave={onClickSaveFileShare}
            onClose={onClickCloseFileShare}
          />
        )
        : null}

      {!fileShareId && isFileSharingAllowed
        ? (
          <ManageShareModal
            baseUrl={baseUrl}
            isOpen={manageShareModal.value?.isOpen || false}
            fileShareId={manageShareModal.value?.fileShareId || ''}
            onClickSave={onClickUpdateFileShare}
            onClickDelete={onClickDeleteFileShare}
            onClose={onClickCloseManageShare}
          />
        )
        : null}
    </>
  );
}
