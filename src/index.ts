import connection from './models/connection'
import express from 'express';
import {v4 as uuid} from 'uuid';
import events from 'events';
import helmet from '@fastify/helmet'
import fastify from 'fastify';
import { Static, Type } from '@sinclair/typebox';

export interface rlpSettings {
    port?: number;
    password?: string;
    customExp? : FastifyServer
}
interface connectionDef {
    [key: string]: connection
}

export const PollParams = Type.Object({
    id: Type.String(),
})
  
export type PollParamsType = Static<typeof PollParams>

export const PollBody = Type.Object({
    name: Type.Optional(Type.String()),
    data: Type.Optional(Type.String()),
})
  
export type PollBodyType = Static<typeof PollBody>

const createFastifyServer = () => {
    return fastify()
}

export type FastifyServer = ReturnType<typeof createFastifyServer>

export class rlp {
    private connections : connectionDef;
    private port : number;
    private password : string;
    private stream : events;
    

    constructor(settings : rlpSettings){
        const pollServer = settings.customExp || createFastifyServer();
        this.connections = {};

        this.port = settings.port || 2004;
        this.password = settings.password || '';
        this.stream = new events.EventEmitter();
        pollServer.register(helmet);

        pollServer.post<{Body: { password?: String; }}>("/connection", async (req, res) => {
            if (this.password !== ''){
                if (req.body.password && req.body.password == this.password){
                    const id = uuid();
                    this.connections[id] = new connection(id, () => {
                        delete this.connections[id];
                    });
                    this.stream.emit('connection', this.connections[id]);
                    res.send({
                        success: true,
                        socketId: id
                    })
                }else{
                    res.status(401).send({
                        success: false,
                        reason: "Unauthorized"
                    })
                }
            }else{
                const id = uuid();
                this.connections[id] = new connection(id, () => {
                    delete this.connections[id];
                });
                this.stream.emit('connection', this.connections[id]);
                res.send({
                    success: true,
                    socketId: id
                })
            }
        })

        pollServer.get<{ Params: PollParamsType }>("/poll/:id", { schema: { params: PollParams } }, async (req, res) => {
            const id = req.params.id;
            if (this.connections[id] !== undefined){
                this.connections[id]._get(req,res);
            }else{
                res.status(400).send({
                    success: false,
                    reason: "Not a valid connection"
                })
            }
        })
        pollServer.post<{ Params: PollParamsType, Body: PollBodyType }>("/poll/:id", { schema: { params: PollParams } }, async (req, res) => {
            const id = req.params.id;
            if (this.connections[id] !== undefined){
                this.connections[id]._post(req,res);
            }else{
                res.status(400).send({
                    success: false,
                    reason: "Not a valid connection"
                })
            }
        })

        pollServer.delete<{Params: PollParamsType}>("/connection/:id", { schema: { params: PollParams } }, async (req, res) => {
            const id = req.params.id;
            if (this.connections[id] !== undefined){
                this.connections[id]._disconnect();
            } else {
                res.status(400).send({
                    success: false,
                    reason: "Not a valid connection"
                })
            }
        })


        if(!settings.customExp) pollServer.listen({ port: this.port });
    }

    on(event : string, handler : (...args: any[]) => void){
        return this.stream.on(event, handler)
    }

    broadcast(name: string, message: string){
        for (const id of Object.keys(this.connections)){
            this.connections[id].send(name, message);
        }
    }
}
export default rlp