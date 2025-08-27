import React from "react";

function FilePreview({ selectedFile }) {
  if (!selectedFile) {
    return (
      <div className="p-3 border rounded bg-light" style={{ maxWidth: "600px", width: "100%", margin: "24px auto 0 auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80px", background: "#f9f6f0", border: "2px solid #e8d5b5" }}>
        <div style={{ fontSize: "2.5rem", marginBottom: "8px", color: "#4a8c5f" }}>📁</div>
        <div style={{ color: "#2e6e41", fontWeight: "500", fontSize: "1.1rem", textAlign: "center" }}>
          Aucun fichier sélectionné
        </div>
      </div>
    );
  }

  const isImage = selectedFile.type.startsWith("image/");
  const isText = selectedFile.type.startsWith("text/");
  const isPDF = selectedFile.type === "application/pdf";

  const [content, setContent] = React.useState(null);

  React.useEffect(() => {
    if (isText) {
      const reader = new FileReader();
      reader.onload = (e) => setContent(e.target.result);
      reader.readAsText(selectedFile);
    } else {
      setContent(null);
    }
  }, [selectedFile]);

  const fileURL = URL.createObjectURL(selectedFile);

  return (
    <div className="p-3 border rounded bg-light" style={{ 
      boxShadow: "0 2px 8px rgba(139, 105, 58, 0.15)", 
      maxWidth: "600px", 
      margin: "20px auto", 
      background: "#f9f6f0", 
      border: "2px solid #e8d5b5" 
    }}>
      <h5 style={{ color: '#2e6e41', fontWeight: 'bold', marginBottom: '18px' }}>Aperçu de : {selectedFile.name}</h5>

      {isImage && (
        <img
          src={fileURL}
          alt="Preview"
          style={{ 
            maxWidth: "100%", 
            height: "auto", 
            borderRadius: "8px", 
            boxShadow: "0 1px 6px rgba(74, 140, 95, 0.15)",
            border: "1px solid #cce2cc"
          }}
        />
      )}

      {isPDF && (
        <embed
          src={fileURL}
          type="application/pdf"
          width="100%"
          height="500px"
          style={{ 
            border: "1px solid #cce2cc", 
            borderRadius: "8px", 
            background: "#e8f4e8" 
          }}
        />
      )}

      {isText && <pre style={{ 
        whiteSpace: "pre-wrap", 
        background: "#e8f4e8", 
        padding: "12px", 
        borderRadius: "8px", 
        color: "#2e6e41",
        border: "1px solid #cce2cc"
      }}>{content}</pre>}

      {!isImage && !isText && !isPDF && (
        <p style={{ 
          color: '#8c6d1f', 
          fontWeight: 'bold', 
          background: '#fff9e6', 
          padding: '10px', 
          borderRadius: '8px',
          border: "1px solid #e8d5b5"
        }}>Aperçu non disponible pour ce type de fichier.</p>
      )}
    </div>
  );
}

export default FilePreview;