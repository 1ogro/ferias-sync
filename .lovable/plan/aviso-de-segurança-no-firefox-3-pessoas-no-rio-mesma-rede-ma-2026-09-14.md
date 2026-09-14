# Aviso de segurança no Firefox (3 pessoas no Rio, mesma rede, Mac)

## O que está acontecendo

O sistema está no ar normalmente e o endereço `ferias-sync.lovable.app` não tem domínio próprio configurado — o certificado de segurança é emitido e renovado automaticamente pela hospedagem.

Como só três pessoas, todas no mesmo local e na mesma rede, veem o alerta, a causa quase certa é algo entre o computador delas e o site trocando o certificado no meio do caminho: antivírus com "proteção web/HTTPS", VPN, ou o roteador/firewall daquela rede. Também pode ser relógio do Mac fora de hora.

## Roteiro para os colaboradores

Peça para fazerem na ordem e pararem quando o site abrir:

1. **Ver o código do erro**: no aviso do Firefox, clicar em "Avançado" e anotar o código (ex.: `MOZILLA_PKIX_ERROR_MITM_DETECTED`, `SEC_ERROR_UNKNOWN_ISSUER`, `SEC_ERROR_EXPIRED_CERTIFICATE`). Isso já diz qual dos casos abaixo é.
2. **Conferir data e hora do Mac**: Ajustes do Sistema > Geral > Data e Hora > "Definir data e hora automaticamente" ligado, fuso Brasília. Reiniciar o Firefox.
3. **Testar em outro navegador** (Safari ou Chrome) no mesmo computador. Se der erro em todos, o problema é do computador ou da rede, não do Firefox.
4. **Testar em outra rede**: 4G/5G do celular por compartilhamento, sem VPN. Se funcionar, o bloqueio é do Wi-Fi/firewall daquele escritório.
5. **Desligar temporariamente a proteção web/HTTPS do antivírus** (Avast, AVG, Bitdefender, Kaspersky, ESET costumam ter "Web Shield" / "Análise de SSL"). Recarregar o site.
6. **Limpar o estado do Firefox**: abrir uma janela privativa; se resolver, limpar cookies e cache do site. Se aparecer "não é possível adicionar exceção", isso é só o HSTS agindo — é esperado e não indica invasão.
7. **Testar em modo de segurança do Firefox** (Ajuda > Modo de solução de problemas) para descartar extensão instalada.

Se sobrar alguém com erro depois disso, pedir a captura da tela de "Avançado" mostrando quem emitiu o certificado — se o emissor não for uma autoridade pública, confirma interceptação na rede/antivírus e o caso vira conversa com o TI do local.

## O que eu faço em seguida

- Nenhuma alteração no sistema é necessária agora; não há nada a corrigir no código ou na publicação.
- Se o TI confirmar que a rede bloqueia endereços `.lovable.app`, o caminho é conectar um domínio próprio da empresa ao projeto. Posso preparar isso quando você quiser.
