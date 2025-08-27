
// Simple config file to centralize env vars
const MAX_FILES_PER_DROP = Number(process.env.REACT_APP_MAX_FILES_PER_DROP) || 6;
const MAX_FILE_SIZE_MB = Number(process.env.REACT_APP_MAX_FILE_SIZE_MB) || 3;

export default {
  maxFilesPerDrop: MAX_FILES_PER_DROP,
  maxFileSizeMB: MAX_FILE_SIZE_MB,
};
