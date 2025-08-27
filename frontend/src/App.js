import React, { useState } from "react";
import axios from "axios";
import DropZone from "./components/DropZone";
import FilePreview from "./components/FilePreview";
import ChatPanel from "./components/ChatPanel";

function App() {
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [downloadLink, setDownloadLink] = useState(null);
  const [downloadName, setDownloadName] = useState("");

  const sendToBackend = async (file, action) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (file.type === "application/pdf") {
        formData.append("action", "resumer");
      } else if (file.type.startsWith("image/")) {
        formData.append("action", "decrire");
      }

      const response = await axios.post(
        "http://localhost:3001/analyze",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
          responseType: "blob",
        }
      );

      // Créer URL pour le blob reçu
      const blob = new Blob([response.data], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const name = `${action}_${file.name}.txt`;

      setDownloadLink(url);
      setDownloadName(name);
    } catch (error) {
      console.error("Erreur lors de l'envoi au backend :", error);
      alert("Une erreur est survenue. Vérifie ton backend !");
    }
  };

  // Gère la suppression d'un fichier, supprime la preview si besoin
  const handleFileDeleted = (deletedFile) => {
    if (selectedFile && deletedFile.name === selectedFile.name) {
      setSelectedFile(null);
    }
  };

  return (
    <div className="container-fluid mt-4" >
      <div className="row g-3">
        {/* Zone de drag & drop - Only this column gets no padding/margin */}
        <div className="col-md-4" >
          <DropZone
            files={files}
            onFilesAdded={setFiles}
            onFileSelected={setSelectedFile}
            onFileDeleted={handleFileDeleted}
          />
        </div>
        {/* Zone de preview - Keep original Bootstrap styling */}
        <div className="col-md-4" style={{ paddingTop: '0', marginTop: '60px' }}>
          <FilePreview selectedFile={selectedFile} />
        </div>
        {/* Zone de chat - Keep original Bootstrap styling */}
        <div className="col-md-4" style={{ paddingTop: '0', marginTop: '40px' }}>
          <ChatPanel
            selectedFile={selectedFile}
            onSendRequest={sendToBackend}
            downloadLink={downloadLink}
            downloadName={downloadName}
          />
        </div>
      </div>
    </div>
  );
}

export default App;