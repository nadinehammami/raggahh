import React, { useState, useEffect } from "react";

function ChatPanel({ selectedFile, onSendRequest, downloadLink, downloadName }) {
  const [messages, setMessages] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [currentDownloadLink, setCurrentDownloadLink] = useState(null);

  // Réinitialiser le lien de téléchargement quand le fichier change
  useEffect(() => {
    setCurrentDownloadLink(null);
    setIsSending(false);
    
    if (!selectedFile) {
      setMessages([
        // Supprimé le message "Bonjour je suis ton assistant..."
      ]);
    } else if (selectedFile.type === "application/pdf") {
      setMessages([
        { id: 1, text: "Voulez-vous le resumé de ce document PDF. Oui/Non ?", type: "bot" },
        { id: 2, text: "Oui je veux bien ! ", isButton: true, type: "button" },
      ]);
    } else if (selectedFile.type.startsWith("image/")) {
      setMessages([
        { id: 1, text: "Voulez-vous la description de cette image. Oui/Non ?", type: "bot" },
        { id: 2, text: "Oui je veux bien ! ", isButton: true, type: "button" },
      ]);
    } else {
      setMessages([
        { id: 1, text: "Type de fichier non supporté pour résumé ou description.", type: "bot" },
      ]);
    }
  }, [selectedFile]);

  // Mettre à jour le lien de téléchargement quand il arrive
  useEffect(() => {
    if (downloadLink) {
      setCurrentDownloadLink(downloadLink);
      setIsSending(false);
      setMessages((prev) => [
        ...prev.filter((msg) => !msg.text.startsWith("Travail en cours")),
        { id: prev.length, text: "Votre fichier est prêt ! Vous pouvez le télécharger.", type: "bot" },
        { id: prev.length + 1, text: "Télécharger", isDownload: true, type: "download" }
      ]);
    }
  }, [downloadLink]);

  const handleYesClick = () => {
    if (!selectedFile) return;
    const action = selectedFile.type === "application/pdf" ? "resumer" : "decrire";
    onSendRequest(selectedFile, action);
    setIsSending(true);
    setCurrentDownloadLink(null);
    setMessages((prev) => [
      ...prev,
      { id: prev.length, text: "Travail en cours...", type: "status" },
    ]);
  };

  return (
    <div
      style={{
        height: "600px",
        border: "2px solid #e8d5b5",
        borderRadius: "12px",
        padding: "15px",
        backgroundColor: "#f9f6f0",
        overflowY: "auto",
        userSelect: "none",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 4px 12px rgba(139, 105, 58, 0.15)",
      }}
    >
      {/* En-tête avec le style OpenBee */}
      <div style={{
        padding: "10px 15px",
        backgroundColor: "#4a8c5f",
        color: "white",
        borderRadius: "8px",
        marginBottom: "15px",
        textAlign: "center",
        fontWeight: "bold",
        fontSize: "16px"
      }}>
        OpenBee Assistant
      </div>
      
      {/* Conteneur des messages */}
      <div style={{ 
        flex: 1, 
        display: "flex", 
        flexDirection: "column",
      }}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              margin: "8px 0",
              padding: "12px 16px",
              borderRadius: "18px",
              fontWeight: "bold",
              boxShadow: "0 2px 4px rgba(0,0,0,0.08)",
              maxWidth: "80%",
              // Seul le bouton "Oui" reste à gauche, tous les autres messages à droite
              alignSelf: msg.isButton ? "flex-start" : "flex-end",
              backgroundColor: 
                msg.type === "bot" ? "#e8f4e8" : 
                msg.type === "status" ? "#fff9e6" : 
                msg.type === "download" ? "#e8f4e8" :
                "transparent",
              color: 
                msg.type === "bot" ? "#2e6e41" : 
                msg.type === "status" ? "#8c6d1f" : 
                msg.type === "download" ? "#2e6e41" :
                "inherit",
              border: msg.type === "bot" || msg.type === "download" ? "1px solid #cce2cc" : "none",
              textAlign: "left",
            }}
          >
            {msg.isButton ? (
              <button
                onClick={handleYesClick}
                disabled={isSending}
                style={{
                  padding: "10px 20px",
                  backgroundColor: isSending ? "#a0a0a0" : "#4a8c5f",
                  color: "white",
                  border: "none",
                  borderRadius: "25px",
                  cursor: isSending ? "not-allowed" : "pointer",
                  fontWeight: "bold",
                  fontSize: "14px",
                  transition: "all 0.2s ease",
                  boxShadow: "0 2px 6px rgba(74, 140, 95, 0.3)",
                }}
                onMouseOver={(e) => {
                  if (!isSending) e.target.style.backgroundColor = "#3a6c4a";
                }}
                onMouseOut={(e) => {
                  if (!isSending) e.target.style.backgroundColor = "#4a8c5f";
                }}
              >
                {isSending ? "Traitement..." : msg.text}
              </button>
            ) : msg.isDownload ? (
              <a 
                href={currentDownloadLink} 
                download={downloadName}
                style={{
                  padding: "10px 20px",
                  backgroundColor: "#4a8c5f",
                  color: "white",
                  textDecoration: "none",
                  borderRadius: "25px",
                  fontWeight: "bold",
                  display: "inline-block",
                  transition: "all 0.2s ease",
                  boxShadow: "0 2px 6px rgba(74, 140, 95, 0.3)",
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = "#3a6c4a"}
                onMouseOut={(e) => e.target.style.backgroundColor = "#4a8c5f"}
              >
                Télécharger le fichier .txt
              </a>
            ) : (
              msg.text
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ChatPanel;