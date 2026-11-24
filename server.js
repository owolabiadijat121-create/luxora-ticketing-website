
require("dotenv").config();
const express=require("express"),helmet=require("helmet"),rateLimit=require("express-rate-limit");
const Database=require("better-sqlite3"),nodemailer=require("nodemailer"),QRCode=require("qrcode");
const crypto=require("crypto"),path=require("path");
const app=express(),PORT=Number(process.env.PORT||4242),SITE=(process.env.SITE_URL||`http://localhost:${PORT}`).replace(/\/$/),KEY=process.env.PAYSTACK_SECRET_KEY||"";
const db=new Database(path.join(__dirname,"luxora.sqlite"));db.pragma("journal_mode=WAL");
db.exec(`CREATE TABLE IF NOT EXISTS orders(ref TEXT PRIMARY KEY,name TEXT,email TEXT,female INTEGER,male INTEGER,amount INTEGER,status TEXT DEFAULT 'pending');
CREATE TABLE IF NOT EXISTS tickets(id TEXT PRIMARY KEY,ref TEXT,type TEXT,email TEXT,used INTEGER DEFAULT 0);`);
app.use(helmet({contentSecurityPolicy:false}));app.use(express.static(path.join(__dirname,"public")));
app.use("/api",rateLimit({windowMs:60000,limit:30}));
function ready(){if(!KEY.startsWith("sk_"))throw Object.assign(new Error("Paystack server key is not configured."),{status:503});}
const validEmail=e=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
app.post("/api/paystack-webhook",express.raw({type:"application/json"}),async(req,res)=>{
 try{ready();const sig=req.headers["x-paystack-signature"],expected=crypto.createHmac("sha512",KEY).update(req.body).digest("hex");
 if(!sig||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return res.sendStatus(401);
 const event=JSON.parse(req.body.toString());if(event.event==="charge.success"&&event.data?.reference)await verify(event.data.reference);res.sendStatus(200);
 }catch(e){console.error(e);res.sendStatus(400);}
});
app.use(express.json({limit:"20kb"}));
app.post("/api/checkout",async(req,res)=>{
 try{ready();const name=String(req.body.name||"").trim().slice(0,100),email=String(req.body.email||"").trim().toLowerCase(),f=Number(req.body.quantity?.female),m=Number(req.body.quantity?.male);
 if(!name||!validEmail(email)||!Number.isInteger(f)||!Number.isInteger(m)||f<0||m<0||f+m<1||f+m>10)return res.status(400).json({error:"Enter valid details and select 1–10 tickets."});
 const amount=(f*40000+m*60000)*100,ref=`LUX-${Date.now()}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
 const r=await fetch("https://api.paystack.co/transaction/initialize",{method:"POST",headers:{Authorization:`Bearer ${KEY}`,"Content-Type":"application/json"},body:JSON.stringify({email,amount,currency:"NGN",reference:ref,callback_url:SITE+"/payment-return.html",metadata:{customer_name:name,female_qty:f,male_qty:m,event:"Luxora Exclusive House Party"}})});
 const d=await r.json();if(!r.ok||!d.status)return res.status(502).json({error:"Paystack could not start checkout."});
 db.prepare("INSERT INTO orders(ref,name,email,female,male,amount) VALUES(?,?,?,?,?,?)").run(ref,name,email,f,m,amount);res.json({authorization_url:d.data.authorization_url});
 }catch(e){res.status(e.status||500).json({error:e.message||"Checkout failed."});}
});
async function verify(ref){
 ready();const o=db.prepare("SELECT * FROM orders WHERE ref=?").get(ref);if(!o||o.status==="paid")return;
 const r=await fetch("https://api.paystack.co/transaction/verify/"+encodeURIComponent(ref),{headers:{Authorization:`Bearer ${KEY}`}}),d=await r.json();
 if(!r.ok||!d.status||d.data.status!=="success"||d.data.reference!==ref||d.data.amount!==o.amount||d.data.currency!=="NGN"||d.data.customer.email.toLowerCase()!==o.email)throw Error("Payment verification mismatch");
 const make=db.transaction(()=>{if(db.prepare("SELECT status FROM orders WHERE ref=?").get(ref)?.status==="paid")return [];
 db.prepare("UPDATE orders SET status='paid' WHERE ref=?").run(ref);const ins=db.prepare("INSERT INTO tickets(id,ref,type,email) VALUES(?,?,?,?)"),out=[];
 for(let i=0;i<o.female;i++){const id="LUX-F-"+crypto.randomBytes(6).toString("hex").toUpperCase();ins.run(id,ref,"Female",o.email);out.push({id,type:"Female"});}
 for(let i=0;i<o.male;i++){const id="LUX-M-"+crypto.randomBytes(6).toString("hex").toUpperCase();ins.run(id,ref,"Male",o.email);out.push({id,type:"Male"});}return out;});
 const tickets=make();if(tickets.length)await emailTickets(o,tickets);
}
async function emailTickets(o,tickets){
 if(!process.env.SMTP_HOST||!process.env.SMTP_USER||!process.env.SMTP_PASS||!process.env.EMAIL_FROM){console.error("SMTP missing; email delivery not configured.");return;}
 const mail=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==="true",auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
 const attachments=[],cards=[];for(const t of tickets){const png=await QRCode.toBuffer("LUXORA-TICKET:"+t.id,{width:320});attachments.push({filename:t.id+".png",content:png,cid:t.id});cards.push(`<p><b>${t.type} ticket — ${t.id}</b><br><img width="180" src="cid:${t.id}"></p>`);}
 await mail.sendMail({from:process.env.EMAIL_FROM,to:o.email,subject:"Your Luxora Residences ticket",html:`<h1>Luxora Residences</h1><h2>Payment confirmed</h2><p>Your tickets for Sunday 27 December 2026, 8 PM, Lekki Phase 1, Lagos.</p>${cards.join("")}<p>Each QR code is valid for one entry.</p>`,attachments});
}
app.get("/api/payment-status",async(req,res)=>{try{ready();const ref=String(req.query.reference||"");if(!/^LUX-[A-Za-z0-9-]+$/.test(ref))return res.status(400).json({error:"Invalid reference"});await verify(ref);const o=db.prepare("SELECT status FROM orders WHERE ref=?").get(ref);res.json({status:o?.status||"not_found"});}catch(e){res.status(400).json({status:"pending",message:"Not confirmed yet. Contact Luxora with your Paystack reference."});}});
app.post("/api/admin/check-in",(req,res)=>{if(!process.env.ADMIN_TOKEN||req.headers["x-admin-token"]!==process.env.ADMIN_TOKEN)return res.sendStatus(401);const id=String(req.body.ticket_id||""),t=db.prepare("SELECT * FROM tickets WHERE id=?").get(id);if(!t)return res.status(404).json({valid:false});if(t.used)return res.status(409).json({valid:false,message:"Already used"});db.prepare("UPDATE tickets SET used=1 WHERE id=?").run(id);res.json({valid:true,type:t.type});});
app.get("/payment-return.html",(req,res)=>res.sendFile(path.join(__dirname,"public","payment-return.html")));
app.listen(PORT,()=>console.log("Luxora ticket server on "+PORT));
