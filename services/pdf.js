// PDF processing service
export const processPdf = async (pdfFile) => {
  const formData = new FormData();
  formData.append('pdf', pdfFile);

  try {
    const response = await fetch('/api/process-pdf', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('PDF processing error:', error);
    throw error;
  }
};
