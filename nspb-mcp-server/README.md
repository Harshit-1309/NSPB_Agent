# Oracle NSPB MCP Server

A production-grade Model Context Protocol (MCP) server for managing substitution variables in Oracle NetSuite Planning & Budgeting (NSPB).

## Features
- **Tool Discovery**: Exposes tools via `/mcp` (tools/list).
- **Substitution Variable Management**: Read and update variables.
- **Robust Error Handling**: Precise error messages from Oracle REST API.
- **Retry Mechanism**: Exponential backoff for network and server errors.
- **Security**: Structured logging with sensitive data masking.
- **Validation**: Strict schema validation using Zod.

## Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment**:
   Create a `.env` file based on `.env.example`:
   ```env
   ORACLE_BASE_URL=https://your-instance.oraclecloud.com
   ORACLE_USERNAME=your-user
   ORACLE_PASSWORD=your-password
   APP_NAME=your-app
   PORT=3000
   ```

3. **Start the Server**:
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm run build
   npm start
   ```

## Example API Calls

### 1. List Available Tools
```bash
curl -X POST http://localhost:3000/mcp \
     -H "Content-Type: application/json" \
     -d '{"method": "tools/list"}'
```

### 2. Fetch Substitution Variables
```bash
curl -X POST http://localhost:3000/mcp \
     -H "Content-Type: application/json" \
     -d '{
       "method": "tools/call",
       "params": {
         "name": "getSubstitutionVariables"
       }
     }'
```

### 3. Update a Substitution Variable
```bash
curl -X POST http://localhost:3000/mcp \
     -H "Content-Type: application/json" \
     -d '{
       "method": "tools/call",
       "params": {
         "name": "updateSubstitutionVariable",
         "arguments": {
           "name": "CurrentMonth",
           "value": "Apr",
           "planType": "ALL"
         }
       }
     }'
```

## Project Structure
- `/src/tools`: Tool implementation logic.
- `/src/services`: Core services (Oracle client, logger).
- `/src/schemas`: Zod validation schemas.
- `server.ts`: Express server and MCP routing logic.
