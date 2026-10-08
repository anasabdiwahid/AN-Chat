// assets/js/upload.js - File & Media Upload Controller

class FileUploader {
    static async upload(file, type = 'document') {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', type);

        try {
            const res = await fetch('api/messages/upload.php', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (!data.success) {
                showToast(data.message || 'File upload failed', 'error');
                return null;
            }
            return data.data; // { file_path, file_name, file_size, message_type }
        } catch (err) {
            console.error('[Upload Error]', err);
            showToast('Failed to upload file due to connection error.', 'error');
            return null;
        }
    }

    static showImagePreview(file, onConfirm) {
        const modal = document.getElementById('imagePreviewModal');
        const imgElement = document.getElementById('previewModalImg');
        const sendBtn = document.getElementById('previewSendBtn');
        const cancelBtn = document.getElementById('previewCancelBtn');

        if (!modal || !imgElement) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            imgElement.src = e.target.result;
            modal.classList.add('active');

            const handleSend = () => {
                cleanup();
                onConfirm(file);
            };

            const handleCancel = () => {
                cleanup();
            };

            const cleanup = () => {
                modal.classList.remove('active');
                sendBtn.removeEventListener('click', handleSend);
                cancelBtn.removeEventListener('click', handleCancel);
            };

            sendBtn.addEventListener('click', handleSend);
            cancelBtn.addEventListener('click', handleCancel);
        };
        reader.readAsDataURL(file);
    }
}

window.FileUploader = FileUploader;
