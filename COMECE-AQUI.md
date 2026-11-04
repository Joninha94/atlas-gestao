# Como rodar a Produtiva Gestão no seu computador

Funciona em **Mac (Intel ou Apple Silicon), Windows e Linux**. Tudo roda em modo **sandbox**:
nada é enviado de verdade para Receita, SEFAZ, WhatsApp ou e-mail — ideal para conhecer e testar.

## 1. Instale o Docker Desktop (uma vez)

Baixe em <https://www.docker.com/products/docker-desktop/>, instale e abra. Espere o ícone da baleia ficar verde.
(No Mac com chip M1/M2/M3/M4, escolha "Apple Silicon".)

## 2. Suba o sistema

Descompacte o `produtiva-gestao.zip` (dois cliques nele). Abra o **Terminal**, digite `cd ` (com espaço),
**arraste a pasta `produtiva-gestao` para dentro do Terminal**, aperte Enter e depois:

```bash
bash iniciar.sh --demo
```

No Windows, dê dois cliques em `iniciar.bat`.

A primeira vez leva **de 5 a 15 minutos** (o Docker baixa e monta tudo). Depois, sobe em segundos.
O `--demo` carrega 6 clientes de exemplo com guias, notas, atendimentos e tarefas. Sem ele, o sistema começa vazio.

## 3. Entre

| | Endereço | Acesso |
| --- | --- | --- |
| **Painel do escritório** | <http://localhost:3000> | CNPJ `11444777000161` · `admin@produtiva.local` · senha `Produtiva@2026` |
| **App do cliente** (versão web) | <http://localhost:8081> | CNPJ de um cliente + e-mail do contato (veja em Clientes). O código chega preenchido. |

Para ver o que "seria enviado" por e-mail, WhatsApp e push: **Configurações → Sandbox**.

## Dia a dia

```bash
bash parar.sh              # para (os dados ficam guardados)
bash iniciar.sh            # sobe de novo
bash parar.sh --apagar     # apaga tudo e começa do zero
docker compose -f docker-compose.local.yml logs -f api    # ver o que a API está fazendo
```

## Se algo der errado

- **"Docker não encontrado" / "Docker Desktop está fechado"**: abra o Docker Desktop e rode de novo.
- **Porta em uso (3000, 3333, 5432 ou 8081)**: feche o outro programa que usa a porta (ex.: um Postgres instalado no Mac) ou pare-o.
- **"A preparação do banco falhou"**: rode `docker compose -f docker-compose.local.yml logs setup` e me mande o final.
- **Abriu o navegador e deu "não é possível acessar"**: o sistema ainda está montando. Espere o Terminal mostrar **✅ Produtiva Gestão no ar!** (na primeira vez pode levar 15 minutos).
- **Qualquer outro problema**: rode `bash diagnostico.sh` e envie o arquivo `diagnostico.txt` que aparece na pasta.

## Próximo passo: usar de verdade

Para ligar Receita (SERPRO), WhatsApp e e-mail reais e colocar num servidor com domínio e HTTPS,
veja a seção **2. Produção** do `README.md`.
