import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { temErro: false };
  }

  static getDerivedStateFromError() {
    return { temErro: true };
  }

  componentDidCatch(error, info) {
    console.error("Erro não tratado na interface:", error, info);
  }

  render() {
    if (this.state.temErro) {
      return (
        <div className="erro-fatal">
          <div className="erro-fatal-card">
            <h2>Algo deu errado</h2>
            <p>
              Um erro inesperado aconteceu nessa tela. Recarregue a página —
              se continuar acontecendo, avise quem cuida do sistema.
            </p>
            <button type="button" onClick={() => window.location.reload()}>
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
