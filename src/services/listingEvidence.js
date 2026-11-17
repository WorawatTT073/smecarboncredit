const { ApiError } = require('./ets');

const maxBytes = 2 * 1024 * 1024;
const signatures = [
  { mediaType: 'application/pdf', bytes: Buffer.from('%PDF-') },
  { mediaType: 'image/png', bytes: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) },
  { mediaType: 'image/jpeg', bytes: Buffer.from([255, 216, 255]) }
];

function parseEvidence(attachments = []) {
  if (!Array.isArray(attachments) || attachments.length > 3) {
    throw new ApiError(400, 'แนบหลักฐานได้สูงสุด 3 ไฟล์');
  }
  return attachments.map(file => {
    if (!file || typeof file.filename !== 'string' || typeof file.data !== 'string') {
      throw new ApiError(400, 'ข้อมูลไฟล์หลักฐานไม่ถูกต้อง');
    }
    const filename = file.filename.trim();
    if (!filename || filename.length > 200 || /[\x00-\x1f\x7f/\\]/.test(filename)) {
      throw new ApiError(400, 'ชื่อไฟล์หลักฐานไม่ถูกต้อง');
    }
    if (!file.data || file.data.length > Math.ceil(maxBytes / 3) * 4
        || file.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(file.data)) {
      throw new ApiError(400, 'ไฟล์หลักฐานต้องมีขนาดไม่เกิน 2 MB ต่อไฟล์');
    }
    const content = Buffer.from(file.data, 'base64');
    const type = signatures.find(signature => content.subarray(0, signature.bytes.length).equals(signature.bytes));
    if (!type || content.length > maxBytes || content.toString('base64') !== file.data) {
      throw new ApiError(400, 'รองรับไฟล์หลักฐาน PDF, PNG หรือ JPEG ขนาดไม่เกิน 2 MB');
    }
    return { filename, mediaType: type.mediaType, content };
  });
}

module.exports = parseEvidence;
