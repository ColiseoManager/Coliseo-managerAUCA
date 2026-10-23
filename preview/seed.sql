-- Datos inventados: no son una copia de clientes, empleados, ventas ni productos reales.
insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000001','admin@prueba.invalid'),
 ('10000000-0000-4000-8000-000000000002','caja@prueba.invalid'),
 ('10000000-0000-4000-8000-000000000003','personal@prueba.invalid'),
 ('10000000-0000-4000-8000-000000000004','otro@prueba.invalid');
insert into profiles(id,full_name,role) values
 ('10000000-0000-4000-8000-000000000001','Administración de prueba','admin'),
 ('10000000-0000-4000-8000-000000000002','Caja de prueba','cashier'),
 ('10000000-0000-4000-8000-000000000003','Personal de prueba','staff'),
 ('10000000-0000-4000-8000-000000000004','Otro personal de prueba','staff');
insert into menu_categories(id,name) values ('20000000-0000-4000-8000-000000000001','Menú de prueba');
insert into menu_subcategories(id,category_id,name) values ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','General');
insert into inventory_items(id,business,name,unit,base_unit,current_stock,minimum_stock,unit_cost) values
 ('30000000-0000-4000-8000-000000000001','Cuervos Pizza','Pizza de prueba lista','pieza','pieza',50,5,60),
 ('30000000-0000-4000-8000-000000000002','EL CLúB','Bebida de prueba','pieza','pieza',100,10,15);
insert into menu_items(id,subcategory_id,name,business,price,unit_cost) values
 ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','Pizza de prueba','Cuervos Pizza',150,60),
 ('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Bebida de prueba','EL CLúB',50,15);
insert into recipes(menu_item_id,inventory_item_id,quantity_required) values
 ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',1),
 ('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',1);
