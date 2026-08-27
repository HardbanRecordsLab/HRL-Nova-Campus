import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export const generateCertificatePDF = async (
  elementId: string,
  filename: string = "certyfikat.pdf"
): Promise<void> => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element with id ${elementId} not found.`);
    return;
  }

  // Wymuszamy stylowanie elementu by dopasowało się do jasnego widoku na PDF
  const originalBackground = element.style.background;
  const originalColor = element.style.color;
  
  // Try to clean up presentation for print
  element.classList.add("print-mode-pdf");

  try {
    const canvas = await html2canvas(element, {
      scale: 2, // higher resolution
      useCORS: true,
      backgroundColor: "#ffffff", // force white background for PDF
    });

    const imgData = canvas.toDataURL("image/png");

    // A4 Format in Landscape
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    // Maintain aspect ratio
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    // Centering vertically just in case
    const topMargin = (pdf.internal.pageSize.getHeight() - pdfHeight) / 2;

    pdf.addImage(imgData, "PNG", 0, topMargin > 0 ? topMargin : 0, pdfWidth, pdfHeight);
    pdf.save(filename);
  } catch (error) {
    console.error("Błąd podczas generowania pliku PDF certyfikatu:", error);
  } finally {
    element.classList.remove("print-mode-pdf");
  }
};
